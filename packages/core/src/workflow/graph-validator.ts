import type { Result } from '@fireapi/browser';

import { WorkflowValidationError } from '../errors.js';
import { WorkflowPlanner } from './planner.js';
import type {
  ExtractStepConfig,
  WorkflowGraph,
  WorkflowStep,
  WorkflowValidationIssue,
  WorkflowValidationResult,
} from './types.js';

function pushError(
  issues: WorkflowValidationIssue[],
  code: string,
  message: string,
  path?: string,
): void {
  issues.push({
    severity: 'error',
    code,
    message,
    ...(path ? { path } : {}),
  });
}

function isConfigMatching(step: WorkflowStep): boolean {
  return step.config.type === step.type;
}

function validateExtractConfig(config: ExtractStepConfig): string | null {
  if (config.extractionType === 'attribute' && !config.attributeName) {
    return 'attributeName is required when extractionType=attribute';
  }
  if (config.extractionType === 'list' && !config.listItemSelector) {
    return 'listItemSelector is required when extractionType=list';
  }
  if (
    config.extractionType === 'list' &&
    config.listItemMode === 'attribute' &&
    !config.listItemAttributeName
  ) {
    return 'listItemAttributeName is required when listItemMode=attribute';
  }
  return null;
}

function pathExists(adjacency: Map<string, string[]>, from: string, to: string): boolean {
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) {
      continue;
    }
    seen.add(current);
    if (current === to) {
      return true;
    }
    for (const next of adjacency.get(current) ?? []) {
      stack.push(next);
    }
  }
  return false;
}

export class WorkflowGraphValidator {
  validate(graph: WorkflowGraph): Result<WorkflowValidationResult, WorkflowValidationError> {
    const issues: WorkflowValidationIssue[] = [];

    if (graph.version !== 2) {
      pushError(issues, 'unsupported_version', 'Workflow graph version must be 2', 'version');
    }

    const stepIds = new Set<string>();
    for (const [index, step] of graph.steps.entries()) {
      if (stepIds.has(step.id)) {
        pushError(
          issues,
          'duplicate_step_id',
          `Duplicate step ID '${step.id}'`,
          `steps.${index}.id`,
        );
      }
      stepIds.add(step.id);

      if (!isConfigMatching(step)) {
        pushError(
          issues,
          'step_config_mismatch',
          'Step config type must match step type',
          `steps.${index}.config.type`,
        );
      }

      if (step.timeout < 0) {
        pushError(issues, 'invalid_timeout', 'Step timeout must be >= 0', `steps.${index}.timeout`);
      }
      if (step.retries < 0) {
        pushError(issues, 'invalid_retries', 'Step retries must be >= 0', `steps.${index}.retries`);
      }

      if (step.type === 'extract') {
        const extractIssue = validateExtractConfig(step.config);
        if (extractIssue) {
          pushError(issues, 'invalid_extract_config', extractIssue, `steps.${index}.config`);
        }
      }
    }

    const adjacency = new Map<string, string[]>();
    for (const stepId of stepIds) {
      adjacency.set(stepId, []);
    }

    for (const [index, edge] of graph.edges.entries()) {
      if (!stepIds.has(edge.from)) {
        pushError(
          issues,
          'unknown_edge_from',
          `Edge source '${edge.from}' does not exist`,
          `edges.${index}.from`,
        );
      }
      if (!stepIds.has(edge.to)) {
        pushError(
          issues,
          'unknown_edge_to',
          `Edge target '${edge.to}' does not exist`,
          `edges.${index}.to`,
        );
      }
      adjacency.get(edge.from)?.push(edge.to);
    }

    for (const [index, parameter] of graph.inputParameters.entries()) {
      if (!stepIds.has(parameter.linkedStepId)) {
        pushError(
          issues,
          'unknown_input_parameter_link',
          `Input parameter '${parameter.name}' linked step does not exist`,
          `inputParameters.${index}.linkedStepId`,
        );
      }
      if (
        parameter.type === 'enum' &&
        (!parameter.enumValues || parameter.enumValues.length === 0)
      ) {
        pushError(
          issues,
          'enum_without_values',
          `Enum input parameter '${parameter.name}' must define enumValues`,
          `inputParameters.${index}.enumValues`,
        );
      }
    }

    for (const [index, target] of graph.extractionTargets.entries()) {
      if (!stepIds.has(target.linkedStepId)) {
        pushError(
          issues,
          'unknown_extraction_target_link',
          `Extraction target '${target.name}' linked step does not exist`,
          `extractionTargets.${index}.linkedStepId`,
        );
      }
    }

    for (const [index, step] of graph.steps.entries()) {
      if (step.type === 'branch') {
        if (!stepIds.has(step.config.trueStepId)) {
          pushError(
            issues,
            'unknown_branch_target',
            'Branch trueStepId does not exist',
            `steps.${index}.config.trueStepId`,
          );
        }
        if (!stepIds.has(step.config.falseStepId)) {
          pushError(
            issues,
            'unknown_branch_target',
            'Branch falseStepId does not exist',
            `steps.${index}.config.falseStepId`,
          );
        }
      }

      if (step.type === 'loop') {
        const { bodyStartStepId, bodyEndStepId, continueStepId } = step.config;
        if (bodyStartStepId === step.id || bodyEndStepId === step.id) {
          pushError(
            issues,
            'invalid_loop_bounds',
            'Loop body bounds cannot reference loop step itself',
            `steps.${index}.config`,
          );
        }
        if (!stepIds.has(bodyStartStepId)) {
          pushError(
            issues,
            'unknown_loop_body_start',
            'Loop bodyStartStepId does not exist',
            `steps.${index}.config.bodyStartStepId`,
          );
        }
        if (!stepIds.has(bodyEndStepId)) {
          pushError(
            issues,
            'unknown_loop_body_end',
            'Loop bodyEndStepId does not exist',
            `steps.${index}.config.bodyEndStepId`,
          );
        }
        if (continueStepId && !stepIds.has(continueStepId)) {
          pushError(
            issues,
            'unknown_loop_continue',
            'Loop continueStepId does not exist',
            `steps.${index}.config.continueStepId`,
          );
        }
        if (stepIds.has(bodyStartStepId) && stepIds.has(bodyEndStepId)) {
          const ok = pathExists(adjacency, bodyStartStepId, bodyEndStepId);
          if (!ok) {
            pushError(
              issues,
              'invalid_loop_path',
              'No path exists from bodyStartStepId to bodyEndStepId',
              `steps.${index}.config`,
            );
          }
        }
      }
    }

    const planner = new WorkflowPlanner();
    const planned = planner.build(graph);
    if (!planned.ok) {
      issues.push({
        severity: 'error',
        code: 'planner_error',
        message: planned.error.message,
      });
    }

    const result: WorkflowValidationResult = {
      valid: issues.every((issue) => issue.severity !== 'error'),
      issues,
    };

    if (!result.valid) {
      return {
        ok: false,
        error: new WorkflowValidationError('Workflow validation failed', { issues }),
      };
    }

    return { ok: true, data: result };
  }
}
