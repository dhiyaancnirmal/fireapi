import type { FastifyInstance } from 'fastify';

import type { DashboardOverviewResponse } from '../../types.js';

export interface DashboardRoutesOptions {
  overview: () => Promise<DashboardOverviewResponse>;
}

export async function registerDashboardRoutes(
  app: FastifyInstance,
  options: DashboardRoutesOptions,
): Promise<void> {
  app.get(
    '/v1/dashboard/overview',
    {
      schema: {
        tags: ['dashboard'],
      },
    },
    async () => options.overview(),
  );
}
