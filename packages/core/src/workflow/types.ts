import type {
  BrowserLease,
  InteractionOptions,
  Result,
  SelectorStrategy,
  TableExtractionResult,
} from '@fireapi/browser';

import type { CorePackageLogger } from '../logger.js';
import type { WorkflowDiffEntry } from '../utils/diff.js';

export type WorkflowGraphVersion = 1 | 2;
export type StepType =
  | 'navigate'
  | 'fill'
  | 'select'
  | 'click'
  | 'wait'
  | 'extract'
  | 'assert'
  | 'branch'
  | 'loop';

export interface InputParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  required: boolean;
  description: string;
  enumValues?: string[];
  defaultValue?: string;
  linkedStepId: string;
}

export interface ExtractionTarget {
  name: string;
  type: 'scalar' | 'array' | 'table';
  schema: Record<string, unknown>;
  linkedStepId: string;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface BaseStep<TType extends StepType, TConfig> {
  id: string;
  type: TType;
  config: TConfig;
  selectors: SelectorStrategy[];
  timeout: number;
  retries: number;
  onFailure: 'abort' | 'skip' | 'fallback_selector';
}

export interface NavigateStepConfig {
  type: 'navigate';
  url: string;
}

export interface FillStepConfig {
  type: 'fill';
  parameterRef: string;
  defaultValue?: string;
}

export interface SelectStepConfig {
  type: 'select';
  parameterRef: string;
  optionMapping?: Record<string, string>;
}

export interface ClickStepConfig {
  type: 'click';
}

export interface WaitStepConfig {
  type: 'wait';
  condition: 'selector' | 'networkidle' | 'timeout';
  value: string | number;
}

export interface ExtractStepConfig {
  type: 'extract';
  target: string;
  extractionType: 'text' | 'attribute' | 'table' | 'list';
  attributeName?: string;
  listItemSelector?: string;
  listItemMode?: 'text' | 'attribute';
  listItemAttributeName?: string;
  append?: boolean;
}

export interface AssertStepConfig {
  type: 'assert';
  leftRef: string;
  operator: 'contains' | 'equals' | 'exists' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
  expected?: unknown;
}

export interface BranchStepConfig {
  type: 'branch';
  condition: string;
  trueStepId: string;
  falseStepId: string;
}

export interface LoopStepConfig {
  type: 'loop';
  maxIterations: number;
  exitCondition: string;
  bodyStartStepId: string;
  bodyEndStepId: string;
  continueStepId?: string;
}

export type StepConfig =
  | NavigateStepConfig
  | FillStepConfig
  | SelectStepConfig
  | ClickStepConfig
  | WaitStepConfig
  | ExtractStepConfig
  | AssertStepConfig
  | BranchStepConfig
  | LoopStepConfig;

export type WorkflowStep =
  | BaseStep<'navigate', NavigateStepConfig>
  | BaseStep<'fill', FillStepConfig>
  | BaseStep<'select', SelectStepConfig>
  | BaseStep<'click', ClickStepConfig>
  | BaseStep<'wait', WaitStepConfig>
  | BaseStep<'extract', ExtractStepConfig>
  | BaseStep<'assert', AssertStepConfig>
  | BaseStep<'branch', BranchStepConfig>
  | BaseStep<'loop', LoopStepConfig>;

export interface WorkflowGraph {
  version: 2;
  id: string;
  name: string;
  sourceUrl: string;
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
  inputParameters: InputParameter[];
  extractionTargets: ExtractionTarget[];
}

export interface WorkflowValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
}

export interface WorkflowValidationResult {
  valid: boolean;
  issues: WorkflowValidationIssue[];
}

export interface ConditionEvaluationContext {
  params: Record<string, unknown>;
  extract: Record<string, unknown>;
  steps: Record<string, StepExecutionOutcome>;
  loop: { iteration: number; stackDepth: number };
}

export interface WorkflowExecutionTraceEvent {
  type:
    | 'execution_start'
    | 'execution_end'
    | 'step_start'
    | 'step_end'
    | 'branch'
    | 'loop_iter'
    | 'loop_exit'
    | 'error';
  timestamp: string;
  stepId?: string;
  details?: Record<string, unknown>;
}

export interface StepExecutionOutcome {
  stepId: string;
  status: 'success' | 'failed' | 'skipped';
  attempts: number;
  output?: unknown;
  error?: { code: string; message: string; details?: Record<string, unknown> };
  startedAt: string;
  finishedAt: string;
}

export interface WorkflowExecutionContext extends ConditionEvaluationContext {
  assertions: Array<{
    stepId: string;
    passed: boolean;
    operator: string;
    left: unknown;
    expected?: unknown;
  }>;
  trace: WorkflowExecutionTraceEvent[];
  startedAt: string;
  finishedAt?: string;
}

export interface WorkflowExecutionResult {
  success: boolean;
  context: WorkflowExecutionContext;
  data: Record<string, unknown>;
  durationMs: number;
}

export interface WorkflowExecutorOptions {
  logger?: CorePackageLogger;
  strictValidation?: boolean;
  maxTotalSteps?: number;
  conditionCache?: boolean;
}

export interface WorkflowRuntime {
  navigate(url: string, options?: { timeoutMs?: number }): Promise<Result<void, Error>>;
  fill(
    selectors: SelectorStrategy[],
    value: string,
    options?: InteractionOptions,
  ): Promise<Result<void, Error>>;
  select(
    selectors: SelectorStrategy[],
    value: string,
    options?: InteractionOptions,
  ): Promise<Result<void, Error>>;
  click(selectors: SelectorStrategy[], options?: InteractionOptions): Promise<Result<void, Error>>;
  waitFor(
    selectors: SelectorStrategy[],
    options?: InteractionOptions,
  ): Promise<Result<void, Error>>;
  extractText(selectors: SelectorStrategy[]): Promise<Result<string | null, Error>>;
  extractAttribute(
    selectors: SelectorStrategy[],
    attribute: string,
  ): Promise<Result<string | null, Error>>;
  extractTable(
    selectors: SelectorStrategy[],
    options?: { sampleRows?: number },
  ): Promise<Result<TableExtractionResult, Error>>;
  extractList(
    selectors: SelectorStrategy[],
    options: { itemSelector: string; mode: 'text' | 'attribute'; attributeName?: string },
  ): Promise<Result<string[], Error>>;
  close?(): Promise<void>;
}

export interface BrowserWorkflowRuntimeOptions {
  lease?: BrowserLease;
  sessionManager?: {
    acquire(): Promise<Result<BrowserLease, Error>>;
    release(lease: BrowserLease, outcome?: 'ok' | 'error'): Promise<void>;
  };
  interaction?: import('@fireapi/browser').ElementInteraction;
  logger?: CorePackageLogger;
}

export interface WorkflowSerializerOptions {
  validateOnParse?: boolean;
  validateOnStringify?: boolean;
}

export type SerializedWorkflowGraph = string;

export interface AutoWorkflowGenerationWarning {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AutoWorkflowGenerationResult {
  workflow: WorkflowGraph;
  warnings: AutoWorkflowGenerationWarning[];
  confidenceSummary: { score: number; reasons: string[] };
}

export interface AutoWorkflowGeneratorOptions {
  name?: string;
  workflowId?: string;
  includePaginationWarnings?: boolean;
}

export interface WorkflowPlan {
  entryStepId: string;
  topologicalOrder: string[];
  outgoingByStepId: Record<string, string[]>;
  incomingByStepId: Record<string, string[]>;
  stepById: Record<string, WorkflowStep>;
}

export type WorkflowGraphDiff = WorkflowDiffEntry[];
