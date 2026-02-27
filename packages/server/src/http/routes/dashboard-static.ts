import { existsSync } from 'node:fs';
import path from 'node:path';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

export interface DashboardStaticOptions {
  enabled: boolean;
  basePath: string;
  assetsPath?: string;
}

function normalizeBasePath(basePath: string): string {
  const value = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export async function registerDashboardStatic(
  app: FastifyInstance,
  options: DashboardStaticOptions,
): Promise<void> {
  if (!options.enabled) {
    return;
  }

  const basePath = normalizeBasePath(options.basePath);
  const root = options.assetsPath
    ? path.resolve(options.assetsPath)
    : path.resolve(process.cwd(), 'packages/dashboard/dist');

  if (!existsSync(root)) {
    app.log.warn({ root }, 'Dashboard assets path does not exist; static dashboard route disabled');
    return;
  }

  await app.register(fastifyStatic, {
    root,
    prefix: `${basePath}/`,
    decorateReply: false,
  });

  app.get(basePath, async (_request, reply) => reply.sendFile('index.html'));
  app.get(`${basePath}/`, async (_request, reply) => reply.sendFile('index.html'));

  app.get(`${basePath}/*`, async (request, reply) => {
    const wildcard = (request.params as { '*': string })['*'];

    if (wildcard?.includes('.')) {
      try {
        return await reply.sendFile(wildcard);
      } catch {
        // fall through to index.html for resilient SPA routing
      }
    }

    return reply.sendFile('index.html');
  });
}
