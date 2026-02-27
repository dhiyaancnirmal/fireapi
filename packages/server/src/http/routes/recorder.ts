import type { RecorderActionInput } from '@fireapi/recorder';
import type { FastifyInstance } from 'fastify';

import { NotFoundError } from '../../errors.js';
import type { RecorderController } from '../../types.js';
import {
  createRecorderSessionRequestSchema,
  finalizeRecorderSessionRequestSchema,
  listRecorderActionsQuerySchema,
  listRecorderSessionsQuerySchema,
  recorderActionInputSchema,
  recorderSessionIdParamsSchema,
} from '../schemas.js';

export interface RecorderRoutesOptions {
  recorderController: RecorderController;
}

function toRecorderActionInput(
  action: ReturnType<typeof recorderActionInputSchema.parse>,
): RecorderActionInput {
  switch (action.type) {
    case 'navigate':
      return { type: 'navigate', url: action.url };
    case 'fill':
      return {
        type: 'fill',
        selectors: action.selectors,
        value: action.value,
        ...(action.parameterRef ? { parameterRef: action.parameterRef } : {}),
      };
    case 'select':
      return {
        type: 'select',
        selectors: action.selectors,
        value: action.value,
        ...(action.parameterRef ? { parameterRef: action.parameterRef } : {}),
      };
    case 'click':
      return {
        type: 'click',
        selectors: action.selectors,
      };
    case 'wait':
      return {
        type: 'wait',
        condition: action.condition,
        value: action.value,
        ...(action.selectors ? { selectors: action.selectors } : {}),
      };
    case 'extract':
      return {
        type: 'extract',
        target: action.target,
        extractionType: action.extractionType,
        selectors: action.selectors,
        ...(action.attributeName ? { attributeName: action.attributeName } : {}),
        ...(action.listItemSelector ? { listItemSelector: action.listItemSelector } : {}),
        ...(action.listItemMode ? { listItemMode: action.listItemMode } : {}),
        ...(action.listItemAttributeName
          ? { listItemAttributeName: action.listItemAttributeName }
          : {}),
      };
    default:
      throw new Error(`Unsupported recorder action type: ${(action as { type: string }).type}`);
  }
}

export async function registerRecorderRoutes(
  app: FastifyInstance,
  options: RecorderRoutesOptions,
): Promise<void> {
  app.post(
    '/v1/recorder/sessions',
    {
      schema: {
        tags: ['recorder'],
        body: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
            name: { type: 'string' },
          },
          required: ['url'],
        },
      },
    },
    async (request) => {
      const body = createRecorderSessionRequestSchema.parse(request.body);
      return options.recorderController.createSession({
        url: body.url,
        ...(body.name ? { name: body.name } : {}),
      });
    },
  );

  app.get(
    '/v1/recorder/sessions',
    {
      schema: {
        tags: ['recorder'],
        querystring: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['active', 'stopped', 'finalized', 'failed'],
            },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            cursor: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const query = listRecorderSessionsQuerySchema.parse(request.query);
      return options.recorderController.listSessions({
        ...(query.status ? { status: query.status } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
      });
    },
  );

  app.get(
    '/v1/recorder/sessions/:sessionId',
    {
      schema: {
        tags: ['recorder'],
        params: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
          },
          required: ['sessionId'],
        },
      },
    },
    async (request) => {
      const { sessionId } = recorderSessionIdParamsSchema.parse(request.params);
      const session = await options.recorderController.getSession(sessionId);
      if (!session) {
        throw new NotFoundError(`Recorder session ${sessionId} not found`);
      }
      return session;
    },
  );

  app.post(
    '/v1/recorder/sessions/:sessionId/actions',
    {
      schema: {
        tags: ['recorder'],
        params: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
          },
          required: ['sessionId'],
        },
      },
    },
    async (request) => {
      const { sessionId } = recorderSessionIdParamsSchema.parse(request.params);
      const body = recorderActionInputSchema.parse(request.body);
      const result = await options.recorderController.addAction(
        sessionId,
        toRecorderActionInput(body),
      );
      if (!result) {
        throw new NotFoundError(`Recorder session ${sessionId} not found`);
      }
      return result;
    },
  );

  app.get(
    '/v1/recorder/sessions/:sessionId/actions',
    {
      schema: {
        tags: ['recorder'],
        params: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
          },
          required: ['sessionId'],
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            cursor: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { sessionId } = recorderSessionIdParamsSchema.parse(request.params);
      const query = listRecorderActionsQuerySchema.parse(request.query);
      return options.recorderController.listActions({
        sessionId,
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
      });
    },
  );

  app.post(
    '/v1/recorder/sessions/:sessionId/finalize',
    {
      schema: {
        tags: ['recorder'],
        params: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
          },
          required: ['sessionId'],
        },
      },
    },
    async (request) => {
      const { sessionId } = recorderSessionIdParamsSchema.parse(request.params);
      const body = finalizeRecorderSessionRequestSchema.parse(request.body ?? {});
      const result = await options.recorderController.finalizeSession({
        sessionId,
        ...(body.register !== undefined ? { register: body.register } : {}),
        ...(body.name ? { name: body.name } : {}),
      });
      if (!result) {
        throw new NotFoundError(`Recorder session ${sessionId} not found`);
      }
      return result;
    },
  );

  app.post(
    '/v1/recorder/sessions/:sessionId/stop',
    {
      schema: {
        tags: ['recorder'],
        params: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
          },
          required: ['sessionId'],
        },
      },
    },
    async (request) => {
      const { sessionId } = recorderSessionIdParamsSchema.parse(request.params);
      const session = await options.recorderController.stopSession(sessionId);
      if (!session) {
        throw new NotFoundError(`Recorder session ${sessionId} not found`);
      }
      return {
        sessionId,
        status: session.status,
      };
    },
  );
}
