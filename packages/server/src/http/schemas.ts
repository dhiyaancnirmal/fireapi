import { z } from 'zod';

const runStatuses = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
const recorderSessionStatuses = ['active', 'stopped', 'finalized', 'failed'] as const;

export const discoveryRequestSchema = z.object({
  url: z.string().url(),
  options: z
    .object({
      waitUntil: z.enum(['domcontentloaded', 'load', 'networkidle']).optional(),
      includeTables: z.boolean().optional(),
      includePagination: z.boolean().optional(),
      detectDependencies: z.boolean().optional(),
      maxTableSampleRows: z.number().int().positive().optional(),
      timeoutMs: z.number().int().positive().optional(),
    })
    .optional(),
});

export const workflowGraphSchema = z.object({
  version: z.number(),
  id: z.string(),
  name: z.string(),
  sourceUrl: z.string(),
  steps: z.array(z.unknown()),
  edges: z.array(z.unknown()),
  inputParameters: z.array(z.unknown()),
  extractionTargets: z.array(z.unknown()),
});

export const generateWorkflowRequestSchema = z.object({
  discovery: z.record(z.string(), z.unknown()),
  options: z.record(z.string(), z.unknown()).optional(),
});

export const validateWorkflowRequestSchema = z.object({
  workflow: workflowGraphSchema,
});

export const registerWorkflowRequestSchema = z.object({
  workflow: workflowGraphSchema,
  name: z.string().min(1).optional(),
});

const createRunByIdSchema = z.object({
  workflowId: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  name: z.string().optional(),
});

const createRunByGraphSchema = z.object({
  workflow: workflowGraphSchema,
  input: z.record(z.string(), z.unknown()),
  name: z.string().optional(),
});

export const createRunRequestSchema = z.union([createRunByIdSchema, createRunByGraphSchema]);

export const listRunsQuerySchema = z.object({
  status: z.enum(runStatuses).optional(),
  limit: z
    .union([z.string(), z.number()])
    .transform((value) => Number(value))
    .refine((value) => Number.isFinite(value) && value > 0 && value <= 100, {
      message: 'limit must be between 1 and 100',
    })
    .optional(),
  cursor: z.string().optional(),
});

export const runIdParamsSchema = z.object({
  runId: z.string().min(1),
});

export const workflowIdParamsSchema = z.object({
  workflowId: z.string().min(1),
});

const selectorStrategySchema = z.object({
  type: z.enum(['css', 'xpath', 'aria', 'text', 'position']),
  value: z.string(),
  confidence: z.number(),
});

export const createRecorderSessionRequestSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).optional(),
});

export const listRecorderSessionsQuerySchema = z.object({
  status: z.enum(recorderSessionStatuses).optional(),
  limit: z
    .union([z.string(), z.number()])
    .transform((value) => Number(value))
    .refine((value) => Number.isFinite(value) && value > 0 && value <= 100, {
      message: 'limit must be between 1 and 100',
    })
    .optional(),
  cursor: z.string().optional(),
});

export const recorderSessionIdParamsSchema = z.object({
  sessionId: z.string().min(1),
});

export const recorderActionInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('navigate'),
    url: z.string().url(),
  }),
  z.object({
    type: z.literal('fill'),
    selectors: z.array(selectorStrategySchema),
    value: z.string(),
    parameterRef: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('select'),
    selectors: z.array(selectorStrategySchema),
    value: z.string(),
    parameterRef: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('click'),
    selectors: z.array(selectorStrategySchema),
  }),
  z.object({
    type: z.literal('wait'),
    condition: z.enum(['selector', 'networkidle', 'timeout']),
    value: z.union([z.string(), z.number()]),
    selectors: z.array(selectorStrategySchema).optional(),
  }),
  z.object({
    type: z.literal('extract'),
    target: z.string().min(1),
    extractionType: z.enum(['text', 'attribute', 'table', 'list']),
    selectors: z.array(selectorStrategySchema),
    attributeName: z.string().min(1).optional(),
    listItemSelector: z.string().optional(),
    listItemMode: z.enum(['text', 'attribute']).optional(),
    listItemAttributeName: z.string().optional(),
  }),
]);

export const listRecorderActionsQuerySchema = z.object({
  limit: z
    .union([z.string(), z.number()])
    .transform((value) => Number(value))
    .refine((value) => Number.isFinite(value) && value > 0 && value <= 100, {
      message: 'limit must be between 1 and 100',
    })
    .optional(),
  cursor: z.string().optional(),
});

export const finalizeRecorderSessionRequestSchema = z.object({
  register: z.boolean().optional(),
  name: z.string().min(1).optional(),
});
