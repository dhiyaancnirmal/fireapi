import type { PageDiscovery } from '@fireapi/browser';
import type { FastifyInstance } from 'fastify';

import { ServerError } from '../../errors.js';
import { discoveryRequestSchema } from '../schemas.js';

export interface DiscoveryRouteOptions {
  pageDiscovery: PageDiscovery;
}

export async function registerDiscoveryRoutes(
  app: FastifyInstance,
  options: DiscoveryRouteOptions,
): Promise<void> {
  app.post(
    '/v1/discovery',
    {
      schema: {
        tags: ['discovery'],
        body: {
          type: 'object',
          properties: {
            url: { type: 'string', format: 'uri' },
            options: { type: 'object' },
          },
          required: ['url'],
        },
      },
    },
    async (request) => {
      const parsed = discoveryRequestSchema.parse(request.body);
      const discoverOptions: Parameters<PageDiscovery['discover']>[0] = { url: parsed.url };
      if (parsed.options?.waitUntil) {
        discoverOptions.waitUntil = parsed.options.waitUntil;
      }
      if (parsed.options?.includeTables !== undefined) {
        discoverOptions.includeTables = parsed.options.includeTables;
      }
      if (parsed.options?.includePagination !== undefined) {
        discoverOptions.includePagination = parsed.options.includePagination;
      }
      if (parsed.options?.detectDependencies !== undefined) {
        discoverOptions.detectDependencies = parsed.options.detectDependencies;
      }
      if (parsed.options?.maxTableSampleRows !== undefined) {
        discoverOptions.maxTableSampleRows = parsed.options.maxTableSampleRows;
      }
      if (parsed.options?.timeoutMs !== undefined) {
        discoverOptions.timeoutMs = parsed.options.timeoutMs;
      }

      const result = await options.pageDiscovery.discover(discoverOptions);

      if (!result.ok) {
        throw new ServerError(result.error.message, result.error.code, result.error.statusCode, {
          ...(result.error.details ?? {}),
          url: parsed.url,
        });
      }

      return { discovery: result.data };
    },
  );
}
