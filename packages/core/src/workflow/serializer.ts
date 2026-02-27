import type { Result } from '@fireapi/browser';

import { WorkflowValidationError } from '../errors.js';
import { type WorkflowDiffEntry, diffObjects } from '../utils/diff.js';
import { stableStringifyWorkflow } from '../utils/stable-json.js';
import { WorkflowGraphValidator } from './graph-validator.js';
import type {
  SerializedWorkflowGraph,
  WorkflowGraph,
  WorkflowGraphDiff,
  WorkflowSerializerOptions,
} from './types.js';

export class WorkflowSerializer {
  private readonly validator: WorkflowGraphValidator;
  private readonly options: Required<WorkflowSerializerOptions>;

  constructor(options: WorkflowSerializerOptions = {}, validator?: WorkflowGraphValidator) {
    this.validator = validator ?? new WorkflowGraphValidator();
    this.options = {
      validateOnParse: options.validateOnParse ?? true,
      validateOnStringify: options.validateOnStringify ?? false,
    };
  }

  parse(input: string | WorkflowGraph): Result<WorkflowGraph, WorkflowValidationError> {
    let graph: WorkflowGraph;
    try {
      graph = typeof input === 'string' ? (JSON.parse(input) as WorkflowGraph) : input;
    } catch (error) {
      return {
        ok: false,
        error: new WorkflowValidationError('Failed to parse workflow JSON', {
          cause: error instanceof Error ? error.message : String(error),
        }),
      };
    }

    if (this.options.validateOnParse) {
      const validated = this.validator.validate(graph);
      if (!validated.ok) {
        return validated;
      }
    }

    return { ok: true, data: graph };
  }

  stringify(graph: WorkflowGraph): Result<SerializedWorkflowGraph, WorkflowValidationError> {
    if (this.options.validateOnStringify) {
      const validated = this.validator.validate(graph);
      if (!validated.ok) {
        return validated;
      }
    }

    return { ok: true, data: stableStringifyWorkflow(graph) };
  }

  diff(a: WorkflowGraph, b: WorkflowGraph): WorkflowGraphDiff {
    return diffObjects(a, b);
  }

  migrateToCurrent(graph: WorkflowGraph): WorkflowGraph {
    return graph;
  }
}

export function diffWorkflowGraphs(a: WorkflowGraph, b: WorkflowGraph): WorkflowDiffEntry[] {
  return diffObjects(a, b);
}
