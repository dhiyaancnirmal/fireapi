import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

export interface OpenAPIRegistrationOptions {
  version: string;
}

export async function registerOpenAPI(
  app: FastifyInstance,
  options: OpenAPIRegistrationOptions,
): Promise<void> {
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'FireAPI Server',
        version: options.version,
      },
      servers: [{ url: '/' }],
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  app.get('/v1/openapi.json', async (_request, reply) => {
    const schema = app.swagger();
    return reply.send(schema);
  });
}
