import type { Result } from '@fireapi/browser';

import { SchemaInferenceError } from '../errors.js';
import { type CorePackageLogger, createCoreLogger } from '../logger.js';
import { WorkflowExecutor } from '../workflow/executor.js';
import type { WorkflowGraph, WorkflowRuntime } from '../workflow/types.js';
import { inferSchemaFromSamples } from './infer-merge.js';
import type {
  InferenceSampleRun,
  InferredObjectSchema,
  InferredSchema,
  SchemaInferenceOptions,
  SchemaInferenceResult,
  SchemaInferenceWarning,
} from './types.js';
import { ZodBuilder } from './zod-builder.js';

interface SchemaInferenceEngineDeps {
  executor?: WorkflowExecutor;
  zodBuilder?: ZodBuilder;
  logger?: CorePackageLogger;
}

const DEFAULT_MAX_FAILURE_RATIO = 0.4;

function isObjectSchema(schema: InferredSchema): schema is InferredObjectSchema {
  return schema.kind === 'object';
}

function ensureGraphInputParameters(schema: InferredSchema, graph: WorkflowGraph): InferredSchema {
  if (!isObjectSchema(schema)) {
    return schema;
  }

  const properties = { ...schema.properties };
  const required = new Set(schema.requiredKeys);
  for (const param of graph.inputParameters) {
    if (!properties[param.name]) {
      properties[param.name] = { kind: 'primitive', type: 'unknown' };
    }
    if (param.required) {
      required.add(param.name);
    }
  }

  return {
    ...schema,
    properties,
    requiredKeys: [...required].sort((a, b) => a.localeCompare(b)),
  };
}

export class SchemaInferenceEngine {
  private readonly executor: WorkflowExecutor;
  private readonly zodBuilder: ZodBuilder;
  private readonly logger: CorePackageLogger;

  constructor(deps: SchemaInferenceEngineDeps = {}) {
    this.executor = deps.executor ?? new WorkflowExecutor();
    this.zodBuilder = deps.zodBuilder ?? new ZodBuilder();
    this.logger = deps.logger ?? createCoreLogger({ base: { module: 'schema-inference-engine' } });
  }

  async inferFromWorkflow(
    graph: WorkflowGraph,
    runtimeFactory: () => Promise<WorkflowRuntime> | WorkflowRuntime,
    options: SchemaInferenceOptions,
  ): Promise<Result<SchemaInferenceResult, SchemaInferenceError>> {
    const includeExamples = options.includeExamples ?? false;
    const enumThreshold = options.enumThreshold ?? 20;
    const maxDepth = options.maxDepth ?? 6;
    const warnings: SchemaInferenceWarning[] = [];
    const sampleRuns: InferenceSampleRun[] = [];
    const successfulOutputs: Record<string, unknown>[] = [];
    const successfulInputs: Record<string, unknown>[] = [];

    for (const input of options.sampleInputs) {
      let runtime: WorkflowRuntime | null = null;
      try {
        runtime = await runtimeFactory();
        const executed = await this.executor.execute(graph, input, runtime);
        if (!executed.ok) {
          warnings.push({
            code: 'sample_execution_failed',
            message: 'Workflow execution failed for one sample input',
            details: {
              input,
              cause: executed.error.message,
              failedStepId: executed.error.failedStepId,
            },
          });
          sampleRuns.push({
            input,
            success: false,
            error: {
              message: executed.error.message,
              ...(executed.error.details ? { details: executed.error.details } : {}),
            },
          });
          continue;
        }

        successfulInputs.push(input);
        successfulOutputs.push(executed.data.data);
        sampleRuns.push({
          input,
          success: true,
          output: executed.data.data,
          execution: executed.data,
        });
      } catch (error) {
        warnings.push({
          code: 'runtime_factory_failed',
          message: 'Runtime factory or execution threw an unexpected error',
          details: {
            input,
            cause: error instanceof Error ? error.message : String(error),
          },
        });
        sampleRuns.push({
          input,
          success: false,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
      } finally {
        try {
          await runtime?.close?.();
        } catch (error) {
          this.logger.warn?.(
            { err: error instanceof Error ? error.message : String(error) },
            'Failed to close runtime after schema inference sample',
          );
        }
      }
    }

    const failureRatio =
      options.sampleInputs.length === 0
        ? 1
        : 1 - successfulOutputs.length / options.sampleInputs.length;
    if (failureRatio > DEFAULT_MAX_FAILURE_RATIO) {
      return {
        ok: false,
        error: new SchemaInferenceError(
          'Too many sample executions failed during schema inference',
          {
            failureRatio,
            maxFailureRatio: DEFAULT_MAX_FAILURE_RATIO,
            sampleCount: options.sampleInputs.length,
            successCount: successfulOutputs.length,
          },
        ),
      };
    }

    if (successfulOutputs.length === 0) {
      return {
        ok: false,
        error: new SchemaInferenceError('No successful sample executions to infer schema from', {
          sampleCount: options.sampleInputs.length,
        }),
      };
    }

    let inputSchema = inferSchemaFromSamples(successfulInputs, {
      enumThreshold,
      maxDepth,
      includeExamples,
    });
    inputSchema = ensureGraphInputParameters(inputSchema, graph);

    const outputSchema = inferSchemaFromSamples(successfulOutputs, {
      enumThreshold,
      maxDepth,
      includeExamples,
    });

    const generated = this.zodBuilder.buildGenerated(inputSchema, outputSchema);

    return {
      ok: true,
      data: {
        inputSchema,
        outputSchema,
        generated,
        sampleRuns,
        warnings,
      },
    };
  }
}
