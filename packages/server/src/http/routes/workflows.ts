import type { DiscoveryResult } from '@fireapi/browser';
import type {
  AutoWorkflowGenerator,
  AutoWorkflowGeneratorOptions,
  WorkflowGraph,
  WorkflowGraphValidator,
} from '@fireapi/core';
import type { FastifyInstance } from 'fastify';

import type { WorkflowRepository } from '../../db/repositories/workflow-repository.js';
import { NotFoundError, ValidationError } from '../../errors.js';
import {
  generateWorkflowRequestSchema,
  registerWorkflowRequestSchema,
  validateWorkflowRequestSchema,
  workflowIdParamsSchema,
} from '../schemas.js';

export interface WorkflowRouteOptions {
  workflowRepository: WorkflowRepository;
  autoWorkflowGenerator: AutoWorkflowGenerator;
  validator: WorkflowGraphValidator;
}

export async function registerWorkflowRoutes(
  app: FastifyInstance,
  options: WorkflowRouteOptions,
): Promise<void> {
  app.post(
    '/v1/workflows/generate',
    {
      schema: {
        tags: ['workflows'],
        body: {
          type: 'object',
          properties: {
            discovery: { type: 'object' },
            options: { type: 'object' },
          },
          required: ['discovery'],
        },
      },
    },
    async (request) => {
      const parsed = generateWorkflowRequestSchema.parse(request.body);
      const discovery = parsed.discovery as unknown as DiscoveryResult;
      const generation = options.autoWorkflowGenerator.generate(
        discovery,
        parsed.options as AutoWorkflowGeneratorOptions | undefined,
      );
      return generation;
    },
  );

  app.post(
    '/v1/workflows/validate',
    {
      schema: {
        tags: ['workflows'],
        body: {
          type: 'object',
          properties: {
            workflow: { type: 'object' },
          },
          required: ['workflow'],
        },
      },
    },
    async (request) => {
      const parsed = validateWorkflowRequestSchema.parse(request.body);
      const validation = options.validator.validate(parsed.workflow as WorkflowGraph);
      if (!validation.ok) {
        return {
          valid: false,
          issues: (validation.error.details?.issues ?? []) as unknown[],
        };
      }

      return {
        valid: true,
        issues: validation.data.issues,
      };
    },
  );

  app.post(
    '/v1/workflows/register',
    {
      schema: {
        tags: ['workflows'],
        body: {
          type: 'object',
          properties: {
            workflow: { type: 'object' },
            name: { type: 'string' },
          },
          required: ['workflow'],
        },
      },
    },
    async (request) => {
      const parsed = registerWorkflowRequestSchema.parse(request.body);
      const validated = options.validator.validate(parsed.workflow as WorkflowGraph);
      if (!validated.ok) {
        throw new ValidationError('Workflow validation failed', {
          issues: validated.error.details?.issues,
        });
      }

      const record = await options.workflowRepository.register({
        workflow: parsed.workflow as WorkflowGraph,
        ...(parsed.name ? { name: parsed.name } : {}),
      });

      return {
        workflowId: record.id,
        hash: record.hash,
        createdAt: record.createdAt,
      };
    },
  );

  app.get(
    '/v1/workflows/:workflowId',
    {
      schema: {
        tags: ['workflows'],
        params: {
          type: 'object',
          properties: {
            workflowId: { type: 'string' },
          },
          required: ['workflowId'],
        },
      },
    },
    async (request) => {
      const { workflowId } = workflowIdParamsSchema.parse(request.params);
      const record = await options.workflowRepository.getById(workflowId);
      if (!record) {
        throw new NotFoundError(`Workflow ${workflowId} not found`);
      }

      return {
        workflow: record.graph,
        metadata: {
          id: record.id,
          name: record.name,
          hash: record.hash,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        },
      };
    },
  );
}
