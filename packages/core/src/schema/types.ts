import type { ZodTypeAny } from 'zod';

import type { CorePackageLogger } from '../logger.js';
import type { WorkflowExecutionResult } from '../workflow/types.js';

export type ObservedValueKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'url'
  | 'null'
  | 'object'
  | 'array'
  | 'table'
  | 'unknown';

export interface TypeObservation {
  count: number;
  nullCount: number;
  emptyCount: number;
  uniqueValues: string[];
  min?: number;
  max?: number;
  formatHints: Array<'date' | 'url'>;
}

export interface SchemaInferenceOptions {
  sampleInputs: Array<Record<string, unknown>>;
  concurrency?: number;
  includeExamples?: boolean;
  enumThreshold?: number;
  maxDepth?: number;
  logger?: CorePackageLogger;
}

export interface InferredPrimitiveSchema {
  kind: 'primitive';
  type: 'string' | 'number' | 'boolean' | 'date' | 'url' | 'unknown';
  nullable?: boolean;
  enumValues?: Array<string | number | boolean>;
  examples?: unknown[];
}

export interface InferredObjectSchema {
  kind: 'object';
  nullable?: boolean;
  properties: Record<string, InferredSchema>;
  requiredKeys: string[];
  examples?: unknown[];
}

export interface InferredArraySchema {
  kind: 'array';
  nullable?: boolean;
  itemSchema: InferredSchema;
  examples?: unknown[];
}

export interface InferredTableSchema {
  kind: 'table';
  nullable?: boolean;
  headers: string[];
  rowSchema: InferredSchema;
  rowCount?: { min?: number; max?: number };
  examples?: unknown[];
}

export type InferredSchema =
  | InferredPrimitiveSchema
  | InferredObjectSchema
  | InferredArraySchema
  | InferredTableSchema;

export interface SchemaInferenceWarning {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface InferenceSampleRun {
  input: Record<string, unknown>;
  success: boolean;
  output?: Record<string, unknown>;
  error?: { message: string; details?: Record<string, unknown> };
  execution?: WorkflowExecutionResult;
}

export interface GeneratedZodSchemas {
  input: ZodTypeAny;
  output: ZodTypeAny;
  inputJsonSchema: Record<string, unknown>;
  outputJsonSchema: Record<string, unknown>;
}

export interface SchemaInferenceResult {
  inputSchema: InferredSchema;
  outputSchema: InferredSchema;
  generated: GeneratedZodSchemas;
  sampleRuns: InferenceSampleRun[];
  warnings: SchemaInferenceWarning[];
}
