import type { WorkflowGraph } from '@fireapi/core';
import type { FastifyInstance } from 'fastify';

import type { WorkflowRepository } from '../../db/repositories/workflow-repository.js';
import { NotFoundError, ValidationError } from '../../errors.js';
import type { RunService } from '../../services/run-service.js';
import { createRunRequestSchema, listRunsQuerySchema, runIdParamsSchema } from '../schemas.js';

export interface RunRoutesOptions {
  runService: RunService;
  workflowRepository: WorkflowRepository;
}

export async function registerRunRoutes(
  app: FastifyInstance,
  options: RunRoutesOptions,
): Promise<void> {
  app.post(
    '/v1/runs',
    {
      schema: {
        tags: ['runs'],
        body: {
          oneOf: [
            {
              type: 'object',
              properties: {
                workflowId: { type: 'string' },
                input: { type: 'object' },
                name: { type: 'string' },
              },
              required: ['workflowId', 'input'],
            },
            {
              type: 'object',
              properties: {
                workflow: { type: 'object' },
                input: { type: 'object' },
                name: { type: 'string' },
              },
              required: ['workflow', 'input'],
            },
          ],
        },
      },
    },
    async (request, reply) => {
      const parsed = createRunRequestSchema.parse(request.body);

      let workflowId: string | undefined;
      let workflowSnapshot: WorkflowGraph;

      if ('workflowId' in parsed) {
        const record = await options.workflowRepository.getById(parsed.workflowId);
        if (!record) {
          throw new NotFoundError(`Workflow ${parsed.workflowId} not found`);
        }
        workflowId = record.id;
        workflowSnapshot = record.graph;
      } else {
        workflowSnapshot = parsed.workflow as WorkflowGraph;
      }

      if (!workflowSnapshot.steps || workflowSnapshot.steps.length === 0) {
        throw new ValidationError('Workflow must include at least one step');
      }

      const run = await options.runService.enqueue({
        ...(workflowId ? { workflowId } : {}),
        workflowSnapshot,
        input: parsed.input,
        ...(parsed.name ? { name: parsed.name } : {}),
      });

      return reply.status(202).send({
        runId: run.id,
        status: run.status,
        createdAt: run.createdAt,
      });
    },
  );

  app.get(
    '/v1/runs/:runId',
    {
      schema: {
        tags: ['runs'],
        params: {
          type: 'object',
          properties: {
            runId: { type: 'string' },
          },
          required: ['runId'],
        },
      },
    },
    async (request) => {
      const { runId } = runIdParamsSchema.parse(request.params);
      const run = await options.runService.getRun(runId);
      if (!run) {
        throw new NotFoundError(`Run ${runId} not found`);
      }
      return {
        runId: run.id,
        status: run.status,
        workflowId: run.workflowId ?? undefined,
        input: run.input,
        result: run.result ?? undefined,
        error: run.error ?? undefined,
        trace: run.trace ?? undefined,
        createdAt: run.createdAt,
        startedAt: run.startedAt ?? undefined,
        finishedAt: run.finishedAt ?? undefined,
      };
    },
  );

  app.get(
    '/v1/runs',
    {
      schema: {
        tags: ['runs'],
        querystring: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'],
            },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            cursor: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const query = listRunsQuerySchema.parse(request.query);
      const listed = await options.runService.listRuns({
        ...(query.status ? { status: query.status } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
      });
      return {
        items: listed.items.map((run) => ({
          runId: run.id,
          status: run.status,
          workflowId: run.workflowId ?? undefined,
          input: run.input,
          result: run.result ?? undefined,
          error: run.error ?? undefined,
          trace: run.trace ?? undefined,
          createdAt: run.createdAt,
          startedAt: run.startedAt ?? undefined,
          finishedAt: run.finishedAt ?? undefined,
        })),
        ...(listed.nextCursor ? { nextCursor: listed.nextCursor } : {}),
      };
    },
  );

  app.post(
    '/v1/runs/:runId/cancel',
    {
      schema: {
        tags: ['runs'],
        params: {
          type: 'object',
          properties: {
            runId: { type: 'string' },
          },
          required: ['runId'],
        },
      },
    },
    async (request) => {
      const { runId } = runIdParamsSchema.parse(request.params);
      const run = await options.runService.cancelRun(runId);
      if (!run) {
        throw new NotFoundError(`Run ${runId} not found`);
      }
      return {
        runId: run.id,
        status: run.status,
      };
    },
  );
}
