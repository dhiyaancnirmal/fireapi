import type { FireAPIServerOptions } from './types.js';

export interface ResolvedServerConfig {
  databaseUrl: string;
  firecrawlApiKey?: string;
  host: string;
  port: number;
  runnerConcurrency: number;
  pollIntervalMs: number;
  autoMigrate: boolean;
  dashboard: {
    enabled: boolean;
    basePath: string;
    assetsPath?: string;
  };
  recorder: {
    maxActiveSessions: number;
    actionTimeoutMs: number;
    idleSessionTtlMs: number;
  };
}

export function resolveServerConfig(options: FireAPIServerOptions): ResolvedServerConfig {
  if (!options.databaseUrl) {
    throw new Error('databaseUrl is required');
  }

  const firecrawlApiKey = options.firecrawlApiKey ?? process.env.FIRECRAWL_API_KEY;
  const dashboardAssetsPath =
    options.dashboard?.assetsPath ?? process.env.FIREAPI_DASHBOARD_ASSETS_PATH;

  return {
    databaseUrl: options.databaseUrl,
    ...(firecrawlApiKey ? { firecrawlApiKey } : {}),
    host: options.host ?? '127.0.0.1',
    port: options.port ?? 3001,
    runnerConcurrency: options.runnerConcurrency ?? 1,
    pollIntervalMs: options.pollIntervalMs ?? 500,
    autoMigrate: options.autoMigrate ?? true,
    dashboard: {
      enabled: options.dashboard?.enabled ?? process.env.FIREAPI_DASHBOARD_ENABLED !== 'false',
      basePath:
        options.dashboard?.basePath ?? process.env.FIREAPI_DASHBOARD_BASE_PATH ?? '/dashboard',
      ...(dashboardAssetsPath ? { assetsPath: dashboardAssetsPath } : {}),
    },
    recorder: {
      maxActiveSessions:
        options.recorder?.maxActiveSessions ??
        Number(process.env.FIREAPI_RECORDER_MAX_ACTIVE_SESSIONS ?? 5),
      actionTimeoutMs:
        options.recorder?.actionTimeoutMs ??
        Number(process.env.FIREAPI_RECORDER_ACTION_TIMEOUT_MS ?? 15000),
      idleSessionTtlMs:
        options.recorder?.idleSessionTtlMs ??
        Number(process.env.FIREAPI_RECORDER_IDLE_SESSION_TTL_MS ?? 15 * 60 * 1000),
    },
  };
}
