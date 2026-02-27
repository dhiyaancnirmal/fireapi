import type { DiscoveredElement, DiscoveredTable, DiscoveryResult } from '@fireapi/browser';
import { ulid } from 'ulid';

import type {
  AutoWorkflowGenerationResult,
  AutoWorkflowGenerationWarning,
  AutoWorkflowGeneratorOptions,
  ExtractionTarget,
  InputParameter,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowStep,
} from './types.js';

function toKebab(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'workflow'
  );
}

function paramNameForElement(element: DiscoveredElement): string {
  return toKebab(element.name ?? element.label ?? element.placeholder ?? element.id).replaceAll(
    '-',
    '_',
  );
}

function stepId(prefix: string, index: number): string {
  return `${toKebab(prefix)}-${index + 1}`;
}

function choosePrimaryForm(discovery: DiscoveryResult): {
  formId: string | null;
  elements: DiscoveredElement[];
} {
  const scored = discovery.forms.map((form) => {
    const elements = discovery.elements.filter((el) => form.elementIds.includes(el.id));
    const score = elements.filter((el) =>
      ['text_input', 'search', 'select', 'textarea', 'date_picker'].includes(el.type),
    ).length;
    return { formId: form.id, elements, score };
  });

  scored.sort((a, b) => b.score - a.score || a.elements.length - b.elements.length);
  if (scored[0]) {
    return { formId: scored[0].formId, elements: scored[0].elements };
  }

  return { formId: null, elements: discovery.elements };
}

function chooseLargestTable(discovery: DiscoveryResult): DiscoveredTable | null {
  const sorted = [...discovery.tables].sort(
    (a, b) => b.rowCount - a.rowCount || b.headers.length - a.headers.length,
  );
  return sorted[0] ?? null;
}

function buildInputParameter(element: DiscoveredElement, linkedStepId: string): InputParameter {
  const name = paramNameForElement(element);
  if (element.type === 'checkbox') {
    return {
      name,
      type: 'boolean',
      required: element.required,
      description: element.label ?? element.placeholder ?? name,
      linkedStepId,
    };
  }
  if (element.type === 'select' && element.options && element.options.length > 0) {
    return {
      name,
      type: 'enum',
      required: element.required,
      description: element.label ?? name,
      enumValues: element.options.map((option) => option.value),
      linkedStepId,
    };
  }
  return {
    name,
    type: 'string',
    required: element.required,
    description: element.label ?? element.placeholder ?? name,
    linkedStepId,
  };
}

export class AutoWorkflowGenerator {
  generate(
    discovery: DiscoveryResult,
    options: AutoWorkflowGeneratorOptions = {},
  ): AutoWorkflowGenerationResult {
    const warnings: AutoWorkflowGenerationWarning[] = [];
    const workflowId = options.workflowId ?? ulid();
    const workflowName = options.name ?? `auto-${toKebab(new URL(discovery.url).hostname)}`;

    const { formId, elements: primaryElements } = choosePrimaryForm(discovery);
    const orderedPrimary = discovery.elements.filter((element) =>
      primaryElements.some((candidate) => candidate.id === element.id),
    );

    const inputElements = orderedPrimary.filter((element) =>
      ['text_input', 'search', 'textarea', 'select', 'date_picker', 'checkbox', 'radio'].includes(
        element.type,
      ),
    );
    const submitElement =
      orderedPrimary.find((element) => element.type === 'submit' || element.type === 'button') ??
      discovery.elements.find((element) => element.type === 'submit' || element.type === 'button');
    const table = chooseLargestTable(discovery);

    const steps: WorkflowStep[] = [];
    const edges: WorkflowEdge[] = [];
    const inputParameters: InputParameter[] = [];
    const extractionTargets: ExtractionTarget[] = [];

    const navigateStep: WorkflowStep = {
      id: 'navigate-1',
      type: 'navigate',
      config: { type: 'navigate', url: discovery.url },
      selectors: [],
      timeout: 15000,
      retries: 0,
      onFailure: 'abort',
    };
    steps.push(navigateStep);

    let previousStepId = navigateStep.id;
    let stepCounter = 0;

    for (const element of inputElements) {
      stepCounter += 1;
      const isSelect = element.type === 'select';
      const currentStepId = stepId(isSelect ? 'select' : 'fill', stepCounter);
      const parameter = buildInputParameter(element, currentStepId);
      inputParameters.push(parameter);

      const step: WorkflowStep = isSelect
        ? {
            id: currentStepId,
            type: 'select',
            config: { type: 'select', parameterRef: parameter.name },
            selectors: element.selectors,
            timeout: 10000,
            retries: 0,
            onFailure: 'abort',
          }
        : {
            id: currentStepId,
            type: 'fill',
            config: { type: 'fill', parameterRef: parameter.name },
            selectors: element.selectors,
            timeout: 10000,
            retries: 0,
            onFailure: 'abort',
          };
      steps.push(step);
      edges.push({ from: previousStepId, to: currentStepId });
      previousStepId = currentStepId;
    }

    if (submitElement) {
      const clickStep: WorkflowStep = {
        id: stepId('click-submit', stepCounter + 1),
        type: 'click',
        config: { type: 'click' },
        selectors: submitElement.selectors,
        timeout: 10000,
        retries: 0,
        onFailure: 'abort',
      };
      steps.push(clickStep);
      edges.push({ from: previousStepId, to: clickStep.id });
      previousStepId = clickStep.id;
    } else {
      warnings.push({
        code: 'no_submit_detected',
        message: 'No submit button was detected; workflow may require manual editing',
        details: { formId },
      });
    }

    if (table) {
      const waitStep: WorkflowStep = {
        id: stepId('wait-results', stepCounter + 2),
        type: 'wait',
        config: {
          type: 'wait',
          condition: 'selector',
          value: table.selectors[0]?.value ?? 'table',
        },
        selectors: table.selectors,
        timeout: 10000,
        retries: 0,
        onFailure: 'abort',
      };
      const extractStep: WorkflowStep = {
        id: stepId('extract-table', stepCounter + 3),
        type: 'extract',
        config: {
          type: 'extract',
          target: 'results',
          extractionType: 'table',
        },
        selectors: table.selectors,
        timeout: 10000,
        retries: 0,
        onFailure: 'abort',
      };
      steps.push(waitStep, extractStep);
      edges.push(
        { from: previousStepId, to: waitStep.id },
        { from: waitStep.id, to: extractStep.id },
      );

      const target: ExtractionTarget = {
        name: 'results',
        type: 'table',
        schema: {
          type: 'object',
          properties: {
            headers: { type: 'array', items: { type: 'string' } },
            rows: { type: 'array', items: { type: 'object' } },
            rowCount: { type: 'number' },
          },
        },
        linkedStepId: extractStep.id,
      };
      extractionTargets.push(target);
      previousStepId = extractStep.id;
    } else {
      warnings.push({
        code: 'no_table_detected',
        message: 'No table detected; auto-generator did not add extract step',
      });
    }

    if ((options.includePaginationWarnings ?? true) && discovery.paginationControls.length > 0) {
      warnings.push({
        code: 'pagination_detected_manual_loop_recommended',
        message: 'Pagination controls detected; manual loop step configuration recommended',
        details: { paginationCount: discovery.paginationControls.length },
      });
    }

    const workflow: WorkflowGraph = {
      version: 2,
      id: workflowId,
      name: workflowName,
      sourceUrl: discovery.url,
      steps,
      edges,
      inputParameters,
      extractionTargets,
    };

    const confidenceReasons: string[] = [];
    if (submitElement) confidenceReasons.push('submit-detected');
    if (table) confidenceReasons.push('table-detected');
    if (warnings.length === 0) confidenceReasons.push('no-warnings');

    return {
      workflow,
      warnings,
      confidenceSummary: {
        score: Math.max(
          0,
          Math.min(1, 0.4 + (submitElement ? 0.2 : 0) + (table ? 0.3 : 0) - warnings.length * 0.05),
        ),
        reasons: confidenceReasons,
      },
    };
  }
}
