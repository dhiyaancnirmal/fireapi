import { ulid } from 'ulid';

import type { ExtractionTarget, InputParameter, WorkflowEdge, WorkflowStep } from '@fireapi/core';
import type { WorkflowGraph } from '@fireapi/core';

import type {
  RecorderActionRecord,
  WorkflowDraftBuildOptions,
  WorkflowDraftBuildResult,
} from './types.js';

function toKebab(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  );
}

function toSnake(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'param'
  );
}

function extractionTargetType(
  type: 'text' | 'attribute' | 'table' | 'list',
): ExtractionTarget['type'] {
  if (type === 'table') {
    return 'table';
  }
  if (type === 'list') {
    return 'array';
  }
  return 'scalar';
}

function extractionTargetSchema(
  type: 'text' | 'attribute' | 'table' | 'list',
): Record<string, unknown> {
  if (type === 'table') {
    return {
      type: 'object',
      properties: {
        headers: { type: 'array', items: { type: 'string' } },
        rows: { type: 'array', items: { type: 'object' } },
        rowCount: { type: 'number' },
      },
    };
  }
  if (type === 'list') {
    return {
      type: 'array',
      items: { type: 'string' },
    };
  }
  return { type: 'string' };
}

function buildStepForAction(
  action: RecorderActionRecord,
  index: number,
  counters: Record<string, number>,
): WorkflowStep {
  counters[action.type] = (counters[action.type] ?? 0) + 1;
  const id = `${action.type}-${counters[action.type]}`;

  const base = {
    id,
    selectors: [] as WorkflowStep['selectors'],
    timeout: 15000,
    retries: 0,
    onFailure: 'fallback_selector' as const,
  };

  switch (action.input.type) {
    case 'navigate':
      return {
        ...base,
        id,
        type: 'navigate',
        config: {
          type: 'navigate',
          url: action.input.url,
        },
        onFailure: 'abort',
      };
    case 'fill':
      return {
        ...base,
        id,
        type: 'fill',
        selectors: action.input.selectors,
        config: {
          type: 'fill',
          parameterRef: action.input.parameterRef ?? `fill_${index + 1}`,
          defaultValue: action.input.value,
        },
      };
    case 'select':
      return {
        ...base,
        id,
        type: 'select',
        selectors: action.input.selectors,
        config: {
          type: 'select',
          parameterRef: action.input.parameterRef ?? `select_${index + 1}`,
        },
      };
    case 'click':
      return {
        ...base,
        id,
        type: 'click',
        selectors: action.input.selectors,
        config: { type: 'click' },
      };
    case 'wait':
      return {
        ...base,
        id,
        type: 'wait',
        selectors: action.input.selectors ?? [],
        timeout:
          action.input.condition === 'timeout' && typeof action.input.value === 'number'
            ? action.input.value
            : 15000,
        config: {
          type: 'wait',
          condition: action.input.condition,
          value: action.input.value,
        },
        onFailure: 'abort',
      };
    case 'extract':
      return {
        ...base,
        id,
        type: 'extract',
        selectors: action.input.selectors,
        config: {
          type: 'extract',
          target: toSnake(action.input.target),
          extractionType: action.input.extractionType,
          ...(action.input.attributeName ? { attributeName: action.input.attributeName } : {}),
          ...(action.input.listItemSelector
            ? { listItemSelector: action.input.listItemSelector }
            : {}),
          ...(action.input.listItemMode ? { listItemMode: action.input.listItemMode } : {}),
          ...(action.input.listItemAttributeName
            ? { listItemAttributeName: action.input.listItemAttributeName }
            : {}),
        },
      };
    default:
      return {
        ...base,
        id,
        type: 'wait',
        config: { type: 'wait', condition: 'timeout', value: 100 },
      };
  }
}

export class WorkflowDraftBuilder {
  buildFromActions(options: WorkflowDraftBuildOptions): WorkflowDraftBuildResult {
    const warnings: string[] = [];
    const sortedActions = [...options.actions].sort((a, b) => a.seq - b.seq);
    const steps: WorkflowStep[] = [];
    const edges: WorkflowEdge[] = [];
    const inputParameters: InputParameter[] = [];
    const extractionTargets: ExtractionTarget[] = [];

    const counters: Record<string, number> = {};
    for (const [index, action] of sortedActions.entries()) {
      const step = buildStepForAction(action, index, counters);
      steps.push(step);
      const prev = steps[steps.length - 2];
      if (prev) {
        edges.push({ from: prev.id, to: step.id });
      }

      if (step.type === 'fill' || step.type === 'select') {
        const paramName = toSnake(step.config.parameterRef);
        if (!inputParameters.some((param) => param.name === paramName)) {
          inputParameters.push({
            name: paramName,
            type: 'string',
            required: false,
            description: `Recorded parameter ${paramName}`,
            linkedStepId: step.id,
          });
        }
      }

      if (step.type === 'extract') {
        if (!extractionTargets.some((target) => target.name === step.config.target)) {
          extractionTargets.push({
            name: step.config.target,
            type: extractionTargetType(step.config.extractionType),
            schema: extractionTargetSchema(step.config.extractionType),
            linkedStepId: step.id,
          });
        }
      }
    }

    if (steps.length === 0) {
      warnings.push('No actions were recorded; generated a navigate-only workflow.');
      steps.push({
        id: 'navigate-1',
        type: 'navigate',
        selectors: [],
        timeout: 15000,
        retries: 0,
        onFailure: 'abort',
        config: {
          type: 'navigate',
          url: options.session.startUrl,
        },
      });
    }

    if (steps[0]?.type !== 'navigate') {
      const injected: WorkflowStep = {
        id: 'navigate-1',
        type: 'navigate',
        selectors: [],
        timeout: 15000,
        retries: 0,
        onFailure: 'abort',
        config: {
          type: 'navigate',
          url: options.session.startUrl,
        },
      };
      steps.unshift(injected);
      edges.unshift({ from: injected.id, to: steps[1]?.id ?? injected.id });
      warnings.push('Prepended navigate step because recording did not begin with navigation.');
    }

    if (!steps.some((step) => step.type === 'extract')) {
      warnings.push('No extract action recorded; workflow has no extraction targets.');
    }

    const workflow: WorkflowGraph = {
      version: 2,
      id: options.workflowId ?? ulid(),
      name:
        options.workflowName ?? options.session.name ?? `recording-${toKebab(options.session.id)}`,
      sourceUrl: options.session.startUrl,
      steps,
      edges,
      inputParameters,
      extractionTargets,
    };

    return {
      workflow,
      warnings,
    };
  }
}
