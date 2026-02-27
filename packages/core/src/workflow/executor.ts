import type { Result } from '@fireapi/browser';

import { WorkflowExecutionError } from '../errors.js';
import { type CorePackageLogger, createCoreLogger } from '../logger.js';
import { getPathRefValue, renderTemplate } from '../utils/path-ref.js';
import { stableJsonStringify } from '../utils/stable-json.js';
import { ConditionEvaluator } from './condition-evaluator.js';
import { type ConditionAstNode, ConditionParser } from './condition-parser.js';
import { WorkflowGraphValidator } from './graph-validator.js';
import { WorkflowPlanner } from './planner.js';
import type {
  AssertStepConfig,
  ConditionEvaluationContext,
  StepExecutionOutcome,
  WorkflowExecutionContext,
  WorkflowExecutionResult,
  WorkflowExecutorOptions,
  WorkflowGraph,
  WorkflowRuntime,
  WorkflowStep,
} from './types.js';

interface InternalExecutorState {
  graph: WorkflowGraph;
  runtime: WorkflowRuntime;
  context: WorkflowExecutionContext;
  outgoingByStepId: Record<string, string[]>;
  stepById: Record<string, WorkflowStep>;
  stepCount: number;
  loopStack: Array<{ stepId: string; iteration: number }>;
}

interface StepRunSuccess {
  nextStepId?: string;
  hasNextOverride?: boolean;
}

type StepRunResult = Result<StepRunSuccess, WorkflowExecutionError>;

function nowIso(): string {
  return new Date().toISOString();
}

function startedContext(input: Record<string, unknown>): WorkflowExecutionContext {
  return {
    params: { ...input },
    extract: {},
    steps: {},
    loop: { iteration: 0, stackDepth: 0 },
    assertions: [],
    trace: [],
    startedAt: nowIso(),
  };
}

function stepErrorRecord(error: unknown): {
  code: string;
  message: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof WorkflowExecutionError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }
  if (error instanceof Error) {
    return {
      code: 'STEP_FAILED',
      message: error.message,
    };
  }
  return {
    code: 'STEP_FAILED',
    message: String(error),
  };
}

function toWorkflowExecutionError(
  message: string,
  details?: Record<string, unknown>,
): WorkflowExecutionError {
  return new WorkflowExecutionError(message, details);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return stableJsonStringify(a) === stableJsonStringify(b);
}

function evaluateAssertOperator(
  config: AssertStepConfig,
  left: unknown,
): { passed: boolean; expected: unknown } {
  const expected = config.expected;
  switch (config.operator) {
    case 'exists':
      return { passed: left !== undefined && left !== null, expected };
    case 'equals':
      return { passed: deepEqual(left, expected), expected };
    case 'contains':
      if (typeof left === 'string') {
        return { passed: left.includes(String(expected ?? '')), expected };
      }
      if (Array.isArray(left)) {
        return { passed: left.some((item) => deepEqual(item, expected)), expected };
      }
      return { passed: false, expected };
    case 'in':
      if (Array.isArray(expected)) {
        return { passed: expected.some((item) => deepEqual(item, left)), expected };
      }
      if (typeof expected === 'string') {
        return { passed: expected.includes(String(left ?? '')), expected };
      }
      if (expected && typeof expected === 'object') {
        return { passed: String(left) in (expected as Record<string, unknown>), expected };
      }
      return { passed: false, expected };
    case 'gt':
      return { passed: Number(left) > Number(expected), expected };
    case 'gte':
      return { passed: Number(left) >= Number(expected), expected };
    case 'lt':
      return { passed: Number(left) < Number(expected), expected };
    case 'lte':
      return { passed: Number(left) <= Number(expected), expected };
    default:
      return { passed: false, expected };
  }
}

function appendExtractionValue(existing: unknown, next: unknown): unknown {
  if (existing === undefined) {
    return next;
  }
  if (Array.isArray(existing) && Array.isArray(next)) {
    return [...existing, ...next];
  }
  if (
    existing &&
    next &&
    typeof existing === 'object' &&
    typeof next === 'object' &&
    'headers' in existing &&
    'rows' in existing &&
    'headers' in next &&
    'rows' in next
  ) {
    const existingTable = existing as {
      headers?: unknown;
      rows?: unknown;
      rowCount?: unknown;
    };
    const nextTable = next as {
      headers?: unknown;
      rows?: unknown;
      rowCount?: unknown;
    };
    const existingRows = Array.isArray(existingTable.rows) ? existingTable.rows : [];
    const nextRows = Array.isArray(nextTable.rows) ? nextTable.rows : [];
    return {
      headers:
        Array.isArray(existingTable.headers) && existingTable.headers.length > 0
          ? existingTable.headers
          : nextTable.headers,
      rows: [...existingRows, ...nextRows],
      rowCount:
        (typeof existingTable.rowCount === 'number'
          ? existingTable.rowCount
          : existingRows.length) +
        (typeof nextTable.rowCount === 'number' ? nextTable.rowCount : nextRows.length),
    };
  }
  return next;
}

export class WorkflowExecutor {
  private readonly logger: CorePackageLogger;
  private readonly options: Required<
    Pick<WorkflowExecutorOptions, 'maxTotalSteps' | 'conditionCache'>
  > &
    Pick<WorkflowExecutorOptions, 'strictValidation'>;
  private readonly validator: WorkflowGraphValidator;
  private readonly planner: WorkflowPlanner;
  private readonly conditionParser: ConditionParser;
  private readonly conditionEvaluator: ConditionEvaluator;

  constructor(options: WorkflowExecutorOptions = {}) {
    this.logger = options.logger ?? createCoreLogger({ base: { module: 'workflow-executor' } });
    this.options = {
      strictValidation: options.strictValidation ?? true,
      maxTotalSteps: options.maxTotalSteps ?? 1000,
      conditionCache: options.conditionCache ?? true,
    };
    this.validator = new WorkflowGraphValidator();
    this.planner = new WorkflowPlanner();
    this.conditionParser = new ConditionParser();
    this.conditionEvaluator = new ConditionEvaluator(this.conditionParser);
  }

  async execute(
    graph: WorkflowGraph,
    input: Record<string, unknown>,
    runtime: WorkflowRuntime,
    options?: { initialContext?: Partial<WorkflowExecutionContext> },
  ): Promise<Result<WorkflowExecutionResult, WorkflowExecutionError>> {
    const startedAt = Date.now();

    if (this.options.strictValidation) {
      const validated = this.validator.validate(graph);
      if (!validated.ok) {
        return {
          ok: false,
          error: new WorkflowExecutionError('Workflow validation failed before execution', {
            cause: validated.error.message,
            issues: validated.error.details?.issues,
          }),
        };
      }
    }

    const plan = this.planner.build(graph);
    if (!plan.ok) {
      return {
        ok: false,
        error: new WorkflowExecutionError(plan.error.message, plan.error.details),
      };
    }

    const contextBase = startedContext(input);
    const context: WorkflowExecutionContext = {
      ...contextBase,
      ...(options?.initialContext ?? {}),
      params: { ...contextBase.params, ...(options?.initialContext?.params ?? {}) },
      extract: { ...contextBase.extract, ...(options?.initialContext?.extract ?? {}) },
      steps: { ...contextBase.steps, ...(options?.initialContext?.steps ?? {}) },
      trace: [...contextBase.trace, ...(options?.initialContext?.trace ?? [])],
      assertions: [...contextBase.assertions, ...(options?.initialContext?.assertions ?? [])],
      loop: options?.initialContext?.loop ?? contextBase.loop,
      startedAt: contextBase.startedAt,
    };

    const conditionAstCache = new Map<string, ConditionAstNode>();
    const state: InternalExecutorState = {
      graph,
      runtime,
      context,
      outgoingByStepId: plan.data.outgoingByStepId,
      stepById: plan.data.stepById,
      stepCount: 0,
      loopStack: [],
    };

    const pushTrace = (
      type: WorkflowExecutionContext['trace'][number]['type'],
      details?: Record<string, unknown>,
      stepId?: string,
    ) => {
      state.context.trace.push({
        type,
        timestamp: nowIso(),
        ...(stepId ? { stepId } : {}),
        ...(details ? { details } : {}),
      });
    };

    const syncLoopState = () => {
      const current = state.loopStack[state.loopStack.length - 1];
      state.context.loop = {
        iteration: current?.iteration ?? 0,
        stackDepth: state.loopStack.length,
      };
    };

    const evaluateCondition = (
      condition: string,
      evalContext: ConditionEvaluationContext = state.context,
    ): Result<boolean, WorkflowExecutionError> => {
      let ast: ConditionAstNode | undefined;
      if (this.options.conditionCache) {
        ast = conditionAstCache.get(condition);
      }
      if (!ast) {
        const parsed = this.conditionParser.parse(condition);
        if (!parsed.ok) {
          return {
            ok: false,
            error: toWorkflowExecutionError('Failed to parse condition', {
              cause: parsed.error.message,
              condition,
            }),
          };
        }
        ast = parsed.data;
        if (this.options.conditionCache) {
          conditionAstCache.set(condition, ast);
        }
      }
      if (!ast) {
        return {
          ok: false,
          error: toWorkflowExecutionError('Failed to parse condition', { condition }),
        };
      }
      const evaluated = this.conditionEvaluator.evaluate(ast, evalContext);
      if (!evaluated.ok) {
        return {
          ok: false,
          error: toWorkflowExecutionError('Failed to evaluate condition', {
            cause: evaluated.error.message,
            condition,
          }),
        };
      }
      return { ok: true, data: evaluated.data };
    };

    const defaultNextStepId = (stepId: string): string | undefined => {
      const outgoing = state.outgoingByStepId[stepId] ?? [];
      return outgoing[0];
    };

    const executePrimitiveStep = async (
      step: WorkflowStep,
    ): Promise<Result<unknown, WorkflowExecutionError>> => {
      switch (step.type) {
        case 'navigate': {
          const url = renderTemplate(step.config.url, state.context.params);
          const result = await state.runtime.navigate(url, { timeoutMs: step.timeout });
          if (!result.ok) {
            return {
              ok: false,
              error: toWorkflowExecutionError('Navigate step failed', {
                failedStepId: step.id,
                url,
                cause: result.error.message,
              }),
            };
          }
          return { ok: true, data: undefined };
        }
        case 'fill': {
          const rawValue =
            state.context.params[step.config.parameterRef] ?? step.config.defaultValue ?? '';
          const value = String(rawValue);
          const result = await state.runtime.fill(step.selectors, value, {
            timeoutMs: step.timeout,
            waitForVisible: true,
          });
          if (!result.ok) {
            return {
              ok: false,
              error: toWorkflowExecutionError('Fill step failed', {
                failedStepId: step.id,
                parameterRef: step.config.parameterRef,
                cause: result.error.message,
              }),
            };
          }
          return { ok: true, data: value };
        }
        case 'select': {
          const rawValue = state.context.params[step.config.parameterRef];
          const fallback = String(rawValue ?? '');
          const mapped =
            rawValue !== undefined && rawValue !== null
              ? (step.config.optionMapping?.[String(rawValue)] ?? String(rawValue))
              : (step.config.optionMapping?.[fallback] ?? fallback);
          const result = await state.runtime.select(step.selectors, mapped, {
            timeoutMs: step.timeout,
          });
          if (!result.ok) {
            return {
              ok: false,
              error: toWorkflowExecutionError('Select step failed', {
                failedStepId: step.id,
                parameterRef: step.config.parameterRef,
                cause: result.error.message,
              }),
            };
          }
          return { ok: true, data: mapped };
        }
        case 'click': {
          const result = await state.runtime.click(step.selectors, { timeoutMs: step.timeout });
          if (!result.ok) {
            return {
              ok: false,
              error: toWorkflowExecutionError('Click step failed', {
                failedStepId: step.id,
                cause: result.error.message,
              }),
            };
          }
          return { ok: true, data: undefined };
        }
        case 'wait': {
          if (step.config.condition === 'timeout') {
            const timeoutMs =
              typeof step.config.value === 'number' ? step.config.value : step.timeout;
            const result = await state.runtime.waitFor([], { timeoutMs });
            if (!result.ok) {
              return {
                ok: false,
                error: toWorkflowExecutionError('Wait timeout step failed', {
                  failedStepId: step.id,
                  cause: result.error.message,
                }),
              };
            }
            return { ok: true, data: { timeoutMs } };
          }

          if (step.config.condition === 'networkidle') {
            const networkidleRuntime = state.runtime as {
              waitForNetworkIdle?: (timeoutMs?: number) => Promise<Result<void, Error>>;
            };
            if (!networkidleRuntime.waitForNetworkIdle) {
              return {
                ok: false,
                error: toWorkflowExecutionError('Runtime does not support networkidle waits', {
                  failedStepId: step.id,
                }),
              };
            }
            const timeoutMs =
              typeof step.config.value === 'number' ? step.config.value : step.timeout;
            const result = await networkidleRuntime.waitForNetworkIdle(timeoutMs);
            if (!result.ok) {
              return {
                ok: false,
                error: toWorkflowExecutionError('Wait networkidle step failed', {
                  failedStepId: step.id,
                  cause: result.error.message,
                }),
              };
            }
            return { ok: true, data: { timeoutMs } };
          }

          const result = await state.runtime.waitFor(step.selectors, {
            timeoutMs: typeof step.config.value === 'number' ? step.config.value : step.timeout,
            waitForVisible: true,
          });
          if (!result.ok) {
            return {
              ok: false,
              error: toWorkflowExecutionError('Wait selector step failed', {
                failedStepId: step.id,
                cause: result.error.message,
              }),
            };
          }
          return { ok: true, data: undefined };
        }
        case 'extract': {
          let extracted: unknown;
          switch (step.config.extractionType) {
            case 'text': {
              const result = await state.runtime.extractText(step.selectors);
              if (!result.ok) {
                return {
                  ok: false,
                  error: toWorkflowExecutionError('Extract text step failed', {
                    failedStepId: step.id,
                    cause: result.error.message,
                  }),
                };
              }
              extracted = result.data;
              break;
            }
            case 'attribute': {
              if (!step.config.attributeName) {
                return {
                  ok: false,
                  error: toWorkflowExecutionError('Extract attribute step missing attributeName', {
                    failedStepId: step.id,
                  }),
                };
              }
              const result = await state.runtime.extractAttribute(
                step.selectors,
                step.config.attributeName,
              );
              if (!result.ok) {
                return {
                  ok: false,
                  error: toWorkflowExecutionError('Extract attribute step failed', {
                    failedStepId: step.id,
                    cause: result.error.message,
                  }),
                };
              }
              extracted = result.data;
              break;
            }
            case 'table': {
              const result = await state.runtime.extractTable(step.selectors);
              if (!result.ok) {
                return {
                  ok: false,
                  error: toWorkflowExecutionError('Extract table step failed', {
                    failedStepId: step.id,
                    cause: result.error.message,
                  }),
                };
              }
              extracted = result.data;
              break;
            }
            case 'list': {
              if (!step.config.listItemSelector) {
                return {
                  ok: false,
                  error: toWorkflowExecutionError('Extract list step missing listItemSelector', {
                    failedStepId: step.id,
                  }),
                };
              }
              const result = await state.runtime.extractList(step.selectors, {
                itemSelector: step.config.listItemSelector,
                mode: step.config.listItemMode ?? 'text',
                ...(step.config.listItemAttributeName
                  ? { attributeName: step.config.listItemAttributeName }
                  : {}),
              });
              if (!result.ok) {
                return {
                  ok: false,
                  error: toWorkflowExecutionError('Extract list step failed', {
                    failedStepId: step.id,
                    cause: result.error.message,
                  }),
                };
              }
              extracted = result.data;
              break;
            }
            default:
              return {
                ok: false,
                error: toWorkflowExecutionError('Unsupported extract step type', {
                  failedStepId: step.id,
                  extractionType: (step.config as { extractionType?: string }).extractionType,
                }),
              };
          }

          const key = step.config.target;
          state.context.extract[key] = step.config.append
            ? appendExtractionValue(state.context.extract[key], extracted)
            : extracted;
          return { ok: true, data: state.context.extract[key] };
        }
        case 'assert': {
          const left = getPathRefValue(state.context, step.config.leftRef);
          const evaluated = evaluateAssertOperator(step.config, left);
          state.context.assertions.push({
            stepId: step.id,
            passed: evaluated.passed,
            operator: step.config.operator,
            left,
            ...(evaluated.expected !== undefined ? { expected: evaluated.expected } : {}),
          });
          if (!evaluated.passed) {
            return {
              ok: false,
              error: toWorkflowExecutionError('Assertion failed', {
                failedStepId: step.id,
                leftRef: step.config.leftRef,
                operator: step.config.operator,
                ...(step.config.expected !== undefined ? { expected: step.config.expected } : {}),
                actual: left,
              }),
            };
          }
          return { ok: true, data: { passed: true } };
        }
        case 'branch':
        case 'loop':
          return { ok: true, data: undefined };
        default:
          return {
            ok: false,
            error: toWorkflowExecutionError('Unsupported workflow step type', {
              failedStepId: (step as WorkflowStep).id,
              type: (step as { type?: string }).type,
            }),
          };
      }
    };

    const runStepWithPolicy = async (step: WorkflowStep): Promise<StepRunResult> => {
      let attempts = 0;
      let lastError: WorkflowExecutionError | null = null;

      pushTrace('step_start', { type: step.type }, step.id);
      const stepStartedAt = nowIso();

      while (attempts <= step.retries) {
        attempts += 1;
        try {
          let output: unknown;
          let nextStepId: string | undefined;

          if (step.type === 'branch') {
            const evaluated = evaluateCondition(step.config.condition);
            if (!evaluated.ok) {
              lastError = evaluated.error;
            } else {
              nextStepId = evaluated.data ? step.config.trueStepId : step.config.falseStepId;
              output = { matched: evaluated.data };
              pushTrace(
                'branch',
                {
                  condition: step.config.condition,
                  result: evaluated.data,
                  nextStepId,
                },
                step.id,
              );
              lastError = null;
            }
          } else if (step.type === 'loop') {
            if (state.loopStack.length >= 4) {
              lastError = toWorkflowExecutionError('Maximum loop nesting depth exceeded', {
                failedStepId: step.id,
                maxLoopDepth: 4,
              });
            } else {
              state.loopStack.push({ stepId: step.id, iteration: 0 });
              syncLoopState();
              let completed = false;
              try {
                let iter = 0;
                while (true) {
                  const top = state.loopStack[state.loopStack.length - 1];
                  if (top) {
                    top.iteration = iter;
                  }
                  syncLoopState();

                  const exitCheck = evaluateCondition(step.config.exitCondition);
                  if (!exitCheck.ok) {
                    lastError = exitCheck.error;
                    break;
                  }
                  if (exitCheck.data) {
                    pushTrace('loop_exit', { iteration: iter }, step.id);
                    nextStepId = step.config.continueStepId;
                    output = { iterations: iter, exited: true };
                    completed = true;
                    lastError = null;
                    break;
                  }
                  if (iter >= step.config.maxIterations) {
                    lastError = toWorkflowExecutionError('Loop exceeded maxIterations', {
                      failedStepId: step.id,
                      maxIterations: step.config.maxIterations,
                    });
                    break;
                  }

                  pushTrace('loop_iter', { iteration: iter }, step.id);
                  const bodyRun = await executeFrom(step.config.bodyStartStepId, {
                    stopAtStepId: step.config.bodyEndStepId,
                  });
                  if (!bodyRun.ok) {
                    lastError = bodyRun.error;
                    break;
                  }
                  iter += 1;
                }
              } finally {
                state.loopStack.pop();
                syncLoopState();
              }

              if (completed) {
                lastError = null;
              }
            }
          } else {
            const primitive = await executePrimitiveStep(step);
            if (!primitive.ok) {
              lastError = primitive.error;
            } else {
              output = primitive.data;
              nextStepId = defaultNextStepId(step.id);
              lastError = null;
            }
          }

          if (!lastError) {
            const outcome: StepExecutionOutcome = {
              stepId: step.id,
              status: 'success',
              attempts,
              ...(output !== undefined ? { output } : {}),
              startedAt: stepStartedAt,
              finishedAt: nowIso(),
            };
            state.context.steps[step.id] = outcome;
            pushTrace('step_end', { status: 'success', attempts }, step.id);
            return {
              ok: true,
              data: {
                ...(nextStepId ? { nextStepId } : {}),
                ...(step.type === 'branch' || step.type === 'loop'
                  ? { hasNextOverride: true }
                  : {}),
              },
            };
          }
        } catch (error) {
          lastError = toWorkflowExecutionError('Unexpected step execution error', {
            failedStepId: step.id,
            cause: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const failure =
        lastError ??
        toWorkflowExecutionError('Step failed without error', { failedStepId: step.id });
      if (step.onFailure === 'skip') {
        const outcome: StepExecutionOutcome = {
          stepId: step.id,
          status: 'skipped',
          attempts,
          error: stepErrorRecord(failure),
          startedAt: stepStartedAt,
          finishedAt: nowIso(),
        };
        state.context.steps[step.id] = outcome;
        pushTrace('step_end', { status: 'skipped', attempts }, step.id);
        const nextStepId = defaultNextStepId(step.id);
        return {
          ok: true,
          data: {
            ...(nextStepId ? { nextStepId } : {}),
            hasNextOverride: true,
          },
        };
      }

      const failedOutcome: StepExecutionOutcome = {
        stepId: step.id,
        status: 'failed',
        attempts,
        error: stepErrorRecord(failure),
        startedAt: stepStartedAt,
        finishedAt: nowIso(),
      };
      state.context.steps[step.id] = failedOutcome;
      pushTrace('error', { message: failure.message }, step.id);
      pushTrace('step_end', { status: 'failed', attempts }, step.id);
      return { ok: false, error: failure };
    };

    const executeFrom = async (
      startStepId: string | undefined,
      opts?: { stopAtStepId?: string },
    ): Promise<Result<{ nextStepId?: string }, WorkflowExecutionError>> => {
      let currentStepId = startStepId;

      while (currentStepId) {
        if (state.stepCount >= this.options.maxTotalSteps) {
          return {
            ok: false,
            error: toWorkflowExecutionError('Workflow exceeded maxTotalSteps safety limit', {
              maxTotalSteps: this.options.maxTotalSteps,
              currentStepId,
            }),
          };
        }
        state.stepCount += 1;

        const step = state.stepById[currentStepId];
        if (!step) {
          return {
            ok: false,
            error: toWorkflowExecutionError('Planner referenced unknown step', { currentStepId }),
          };
        }

        const run = await runStepWithPolicy(step);
        if (!run.ok) {
          return run;
        }

        const nextStepId = run.data.hasNextOverride
          ? run.data.nextStepId
          : (run.data.nextStepId ?? defaultNextStepId(step.id));
        if (opts?.stopAtStepId && step.id === opts.stopAtStepId) {
          return {
            ok: true,
            data: { ...(nextStepId ? { nextStepId } : {}) },
          };
        }

        currentStepId = nextStepId;
      }

      return { ok: true, data: {} };
    };

    pushTrace('execution_start', { workflowId: graph.id });

    try {
      const executed = await executeFrom(plan.data.entryStepId);
      if (!executed.ok) {
        state.context.finishedAt = nowIso();
        pushTrace('execution_end', { success: false });
        return { ok: false, error: executed.error };
      }

      state.context.finishedAt = nowIso();
      pushTrace('execution_end', { success: true });

      const result: WorkflowExecutionResult = {
        success: true,
        context: state.context,
        data: state.context.extract,
        durationMs: Date.now() - startedAt,
      };
      return { ok: true, data: result };
    } catch (error) {
      const wrapped = toWorkflowExecutionError('Workflow execution failed', {
        cause: error instanceof Error ? error.message : String(error),
      });
      state.context.finishedAt = nowIso();
      pushTrace('execution_end', { success: false });
      return { ok: false, error: wrapped };
    } finally {
      try {
        await runtime.close?.();
      } catch (error) {
        this.logger.warn?.(
          { err: error instanceof Error ? error.message : String(error) },
          'Runtime close failed after workflow execution',
        );
      }
    }
  }
}
