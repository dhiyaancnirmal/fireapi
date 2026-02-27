import Fastify from 'fastify';

import { FirecrawlSessionManager, PageDiscovery } from '@fireapi/browser';
import { AutoWorkflowGenerator, WorkflowGraphValidator } from '@fireapi/core';

import { NoopAuthProvider } from './auth/noop-auth-provider.js';
import type { AuthProvider } from './auth/types.js';
import { resolveServerConfig } from './config.js';
import { createDatabaseClient } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { RecordingActionRepository } from './db/repositories/recording-action-repository.js';
import { RecordingSessionRepository } from './db/repositories/recording-session-repository.js';
import { RunEventRepository } from './db/repositories/run-event-repository.js';
import { RunRepository } from './db/repositories/run-repository.js';
import { WorkflowRepository } from './db/repositories/workflow-repository.js';
import { toErrorEnvelope } from './http/error-envelope.js';
import { registerOpenAPI } from './http/openapi.js';
import { registerDashboardStatic } from './http/routes/dashboard-static.js';
import { registerDashboardRoutes } from './http/routes/dashboard.js';
import { registerDiscoveryRoutes } from './http/routes/discovery.js';
import { registerHealthRoutes } from './http/routes/health.js';
import { registerRecorderRoutes } from './http/routes/recorder.js';
import { registerRunRoutes } from './http/routes/runs.js';
import { registerWorkflowRoutes } from './http/routes/workflows.js';
import { createServerLogger } from './logger.js';
import { FirecrawlRecorderService, collectDashboardOverview } from './services/recorder-service.js';
import { RunService, createBrowserRuntimeFactory } from './services/run-service.js';
import type { FireAPIServerInstance, FireAPIServerOptions, RecorderController } from './types.js';

interface BuildServerDeps {
  authProvider?: AuthProvider;
  pageDiscovery?: PageDiscovery;
  runService?: RunService;
  recorderController?: RecorderController;
}

function normalizeHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  const output: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      output[key] = value;
    } else if (Array.isArray(value)) {
      output[key] = value.join(', ');
    } else {
      output[key] = undefined;
    }
  }
  return output;
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/v1/health' || pathname === '/v1/openapi.json' || pathname.startsWith('/docs')
  );
}

async function buildServer(
  options: FireAPIServerOptions,
  deps: BuildServerDeps = {},
): Promise<FireAPIServerInstance> {
  const config = resolveServerConfig(options);
  const logger = options.logger ?? createServerLogger();

  const dbClient = createDatabaseClient(config.databaseUrl);
  if (config.autoMigrate) {
    runMigrations(dbClient.sqlite);
  }

  const workflowRepository = new WorkflowRepository(dbClient);
  const runRepository = new RunRepository(dbClient);
  const runEventRepository = new RunEventRepository(dbClient);
  const recordingSessionRepository = new RecordingSessionRepository(dbClient);
  const recordingActionRepository = new RecordingActionRepository(dbClient);

  const sessionManager = config.firecrawlApiKey
    ? new FirecrawlSessionManager({
        apiKey: config.firecrawlApiKey,
        maxConcurrentSessions: Number(process.env.FIREAPI_MAX_CONCURRENT_SESSIONS ?? 3),
        warmPoolSize: Number(process.env.FIREAPI_SESSION_POOL_SIZE ?? 1),
        sessionTtlSeconds: Number(process.env.FIREAPI_SESSION_TTL ?? 120),
        activityTtlSeconds: Number(process.env.FIREAPI_ACTIVITY_TTL ?? 60),
        maxUsesPerSession: Number(process.env.FIREAPI_MAX_USES_PER_SESSION ?? 25),
        acquireTimeoutMs: Number(process.env.FIREAPI_ACQUIRE_TIMEOUT_MS ?? 15000),
        maxQueueSize: Number(process.env.FIREAPI_SESSION_QUEUE_SIZE ?? 50),
      })
    : null;

  if (sessionManager) {
    await sessionManager.warm();
  }

  const pageDiscovery = deps.pageDiscovery ?? new PageDiscovery();

  const runService =
    deps.runService ??
    new RunService({
      runRepository,
      runEventRepository,
      runtimeFactory: createBrowserRuntimeFactory({
        ...(sessionManager
          ? {
              sessionManager,
            }
          : {}),
      }),
      logger,
      pollIntervalMs: config.pollIntervalMs,
      runnerConcurrency: config.runnerConcurrency,
    });

  const recorderController =
    deps.recorderController ??
    new FirecrawlRecorderService({
      logger,
      pageDiscovery,
      ...(sessionManager ? { sessionManager } : {}),
      sessionRepository: recordingSessionRepository,
      actionRepository: recordingActionRepository,
      workflowRepository,
      maxActiveSessions: config.recorder.maxActiveSessions,
      actionTimeoutMs: config.recorder.actionTimeoutMs,
      idleSessionTtlMs: config.recorder.idleSessionTtlMs,
    });

  const autoWorkflowGenerator = new AutoWorkflowGenerator();
  const validator = new WorkflowGraphValidator();

  const app = Fastify({ logger: false });
  const authProvider = deps.authProvider ?? options.authProvider ?? new NoopAuthProvider();

  app.addHook('preHandler', async (request) => {
    const pathname = request.url.split('?')[0] ?? request.url;
    if (!pathname.startsWith('/v1') || isPublicPath(pathname)) {
      return;
    }

    await authProvider.authorize({
      headers: normalizeHeaders(request.headers),
      method: request.method,
      path: pathname,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const envelope = toErrorEnvelope(error, request.id);
    void reply.status(envelope.statusCode).send(envelope.body);
  });

  await registerOpenAPI(app, {
    version: process.env.npm_package_version ?? '0.1.0',
  });

  await registerHealthRoutes(app, {
    version: process.env.npm_package_version ?? '0.1.0',
  });

  await registerDiscoveryRoutes(app, {
    pageDiscovery: {
      discover: async (discoverOptions) =>
        pageDiscovery.discover({
          ...discoverOptions,
          ...(sessionManager ? { sessionManager } : {}),
        }),
    } as PageDiscovery,
  });

  await registerWorkflowRoutes(app, {
    workflowRepository,
    autoWorkflowGenerator,
    validator,
  });

  await registerRunRoutes(app, {
    runService,
    workflowRepository,
  });

  await registerRecorderRoutes(app, {
    recorderController,
  });

  await registerDashboardRoutes(app, {
    overview: async () =>
      collectDashboardOverview({
        workflowRepository,
        runRepository,
        recordingSessionRepository,
      }),
  });

  await registerDashboardStatic(app, {
    enabled: config.dashboard.enabled,
    basePath: config.dashboard.basePath,
    ...(config.dashboard.assetsPath ? { assetsPath: config.dashboard.assetsPath } : {}),
  });

  let started = false;
  let cleanupTimer: NodeJS.Timeout | null = null;

  return {
    app,
    start: async () => {
      if (started) {
        return;
      }
      await app.listen({ host: config.host, port: config.port });
      runService.startWorkers();
      cleanupTimer = setInterval(
        () => {
          void recorderController.cleanupIdleSessions().catch((error) => {
            logger.warn(
              {
                cause: error instanceof Error ? error.message : String(error),
              },
              'Recorder idle cleanup failed',
            );
          });
        },
        Math.min(config.recorder.idleSessionTtlMs, 60_000),
      );
      started = true;
    },
    stop: async () => {
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }

      if ('stopAll' in recorderController && typeof recorderController.stopAll === 'function') {
        await recorderController.stopAll();
      }

      if (!started) {
        await app.close();
        await runService.stopWorkers();
        await sessionManager?.destroyAll();
        dbClient.close();
        return;
      }
      await runService.stopWorkers();
      await app.close();
      await sessionManager?.destroyAll();
      dbClient.close();
      started = false;
    },
  };
}

export async function createFireAPIServer(
  options: FireAPIServerOptions,
): Promise<FireAPIServerInstance> {
  return buildServer(options);
}

export async function createFireAPIServerInternal(
  options: FireAPIServerOptions,
  deps: BuildServerDeps = {},
): Promise<FireAPIServerInstance> {
  return buildServer(options, deps);
}
