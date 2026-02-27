import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  InteractionOptions,
  Result,
  SelectorStrategy,
  TableExtractionResult,
} from '@fireapi/browser';
import type { WorkflowRuntime } from '@fireapi/core';
import { createDatabaseClient } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { RunEventRepository } from '../../src/db/repositories/run-event-repository.js';
import { RunRepository } from '../../src/db/repositories/run-repository.js';
import { createFireAPIServerInternal } from '../../src/server.js';
import { RunService } from '../../src/services/run-service.js';
import { createDiscoveryFixture } from '../fixtures/discovery.js';
import { createInvalidWorkflow, createValidWorkflow } from '../fixtures/workflow.js';

class NoopRuntime implements WorkflowRuntime {
  async navigate(): Promise<Result<void, Error>> {
    return { ok: true, data: undefined };
  }
  async fill(
    _selectors: SelectorStrategy[],
    _value: string,
    _options?: InteractionOptions,
  ): Promise<Result<void, Error>> {
    return { ok: true, data: undefined };
  }
  async select(
    _selectors: SelectorStrategy[],
    _value: string,
    _options?: InteractionOptions,
  ): Promise<Result<void, Error>> {
    return { ok: true, data: undefined };
  }
  async click(
    _selectors: SelectorStrategy[],
    _options?: InteractionOptions,
  ): Promise<Result<void, Error>> {
    return { ok: true, data: undefined };
  }
  async waitFor(
    _selectors: SelectorStrategy[],
    _options?: InteractionOptions,
  ): Promise<Result<void, Error>> {
    return { ok: true, data: undefined };
  }
  async extractText(_selectors: SelectorStrategy[]): Promise<Result<string | null, Error>> {
    return { ok: true, data: 'value' };
  }
  async extractAttribute(
    _selectors: SelectorStrategy[],
    _attribute: string,
  ): Promise<Result<string | null, Error>> {
    return { ok: true, data: 'value' };
  }
  async extractTable(
    _selectors: SelectorStrategy[],
    _options?: { sampleRows?: number },
  ): Promise<Result<TableExtractionResult, Error>> {
    return { ok: true, data: { headers: ['Name'], rows: [{ Name: 'Alice' }], rowCount: 1 } };
  }
  async extractList(
    _selectors: SelectorStrategy[],
    _options: { itemSelector: string; mode: 'text' | 'attribute'; attributeName?: string },
  ): Promise<Result<string[], Error>> {
    return { ok: true, data: ['item'] };
  }
  async close(): Promise<void> {
    return;
  }
}

interface Harness {
  server: Awaited<ReturnType<typeof createFireAPIServerInternal>>;
  runService: RunService;
  runDbClient: ReturnType<typeof createDatabaseClient>;
  authCalls: string[];
}

async function createHarness(): Promise<Harness> {
  const runDbClient = createDatabaseClient(':memory:');
  runMigrations(runDbClient.sqlite);
  const runRepo = new RunRepository(runDbClient);
  const runEventRepo = new RunEventRepository(runDbClient);

  const runService = new RunService({
    runRepository: runRepo,
    runEventRepository: runEventRepo,
    runtimeFactory: async () => new NoopRuntime(),
    logger: {
      fatal: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      child: vi.fn(() => ({
        fatal: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
      })),
      level: 'info',
      silent: vi.fn(),
      bindings: vi.fn(() => ({})),
    } as never,
    pollIntervalMs: 10,
    runnerConcurrency: 1,
  });

  const authCalls: string[] = [];

  const server = await createFireAPIServerInternal(
    {
      databaseUrl: ':memory:',
      autoMigrate: true,
      firecrawlApiKey: '',
    },
    {
      runService,
      pageDiscovery: {
        discover: vi.fn(async () => ({ ok: true, data: createDiscoveryFixture() })),
      } as never,
      authProvider: {
        authorize: async (ctx) => {
          authCalls.push(`${ctx.method} ${ctx.path}`);
        },
      },
    },
  );

  await server.app.ready();

  return {
    server,
    runService,
    runDbClient,
    authCalls,
  };
}

const harnesses: Harness[] = [];

afterEach(async () => {
  while (harnesses.length > 0) {
    const harness = harnesses.pop();
    if (!harness) continue;
    await harness.server.stop();
    harness.runDbClient.close();
  }
});

describe('FireAPI server routes', () => {
  it('returns health payload and discovery fixture', async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const health = await harness.server.app.inject({ method: 'GET', url: '/v1/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ ok: true, service: 'fireapi-server' });

    const discovery = await harness.server.app.inject({
      method: 'POST',
      url: '/v1/discovery',
      payload: { url: 'https://example.com/search' },
    });
    expect(discovery.statusCode).toBe(200);
    expect(discovery.json().discovery.elements.length).toBeGreaterThan(0);

    const openapi = await harness.server.app.inject({ method: 'GET', url: '/v1/openapi.json' });
    expect(openapi.statusCode).toBe(200);
    expect(openapi.json().openapi).toBe('3.1.0');
  });

  it('validates, generates, creates and completes runs', async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const invalid = await harness.server.app.inject({
      method: 'POST',
      url: '/v1/workflows/validate',
      payload: { workflow: createInvalidWorkflow() },
    });
    expect(invalid.statusCode).toBe(200);
    expect(invalid.json().valid).toBe(false);

    const generated = await harness.server.app.inject({
      method: 'POST',
      url: '/v1/workflows/generate',
      payload: {
        discovery: createDiscoveryFixture(),
      },
    });
    expect(generated.statusCode).toBe(200);
    expect(generated.json().workflow).toBeDefined();

    const createRun = await harness.server.app.inject({
      method: 'POST',
      url: '/v1/runs',
      payload: {
        workflow: createValidWorkflow('wf-route-run'),
        input: { query: 'smith' },
      },
    });
    expect(createRun.statusCode).toBe(202);
    const runId = createRun.json().runId as string;

    await harness.runService.runOnce();

    const runStatus = await harness.server.app.inject({
      method: 'GET',
      url: `/v1/runs/${runId}`,
    });
    expect(runStatus.statusCode).toBe(200);
    expect(runStatus.json().status).toBe('succeeded');

    expect(harness.authCalls.some((entry) => entry.includes('/v1/runs'))).toBe(true);
  });

  it('cancels queued runs', async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const created = await harness.server.app.inject({
      method: 'POST',
      url: '/v1/runs',
      payload: {
        workflow: createValidWorkflow('wf-cancelled'),
        input: { query: 'cancel' },
      },
    });
    const runId = created.json().runId as string;

    const cancelled = await harness.server.app.inject({
      method: 'POST',
      url: `/v1/runs/${runId}/cancel`,
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().status).toBe('cancelled');

    const fetched = await harness.server.app.inject({
      method: 'GET',
      url: `/v1/runs/${runId}`,
    });
    expect(fetched.json().status).toBe('cancelled');
  });
});
