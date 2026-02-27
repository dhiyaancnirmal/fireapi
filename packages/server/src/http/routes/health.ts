import type { FastifyInstance } from 'fastify';

export interface HealthRouteOptions {
  version: string;
}

export async function registerHealthRoutes(
  app: FastifyInstance,
  options: HealthRouteOptions,
): Promise<void> {
  app.get(
    '/v1/health',
    {
      schema: {
        tags: ['health'],
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              service: { type: 'string' },
              version: { type: 'string' },
              time: { type: 'string' },
            },
            required: ['ok', 'service', 'version', 'time'],
          },
        },
      },
    },
    async () => ({
      ok: true,
      service: 'fireapi-server',
      version: options.version,
      time: new Date().toISOString(),
    }),
  );
}
