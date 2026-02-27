import { afterEach, describe, expect, it } from 'vitest';

import type {
  InteractionOptions,
  Result,
  SelectorStrategy,
  TableExtractionResult,
} from '@fireapi/browser';
import type { WorkflowGraph, WorkflowRuntime } from '@fireapi/core';
import type {
  RecorderActionInput,
  RecorderActionRecord,
  RecorderSessionRecord,
} from '@fireapi/recorder';

import { createDatabaseClient } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { RunEventRepository } from '../../src/db/repositories/run-event-repository.js';
import { RunRepository } from '../../src/db/repositories/run-repository.js';
import { createFireAPIServerInternal } from '../../src/server.js';
import { RunService } from '../../src/services/run-service.js';
import type { RecorderController } from '../../src/types.js';
import { createDiscoveryFixture } from '../fixtures/discovery.js';

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

function workflowFixture(id: string): WorkflowGraph {
  return {
    version: 2,
    id,
    name: 'Recorded Workflow',
    sourceUrl: 'https://example.com',
    steps: [
      {
        id: 'navigate-1',
        type: 'navigate',
        config: {
          type: 'navigate',
          url: 'https://example.com',
        },
        selectors: [],
        timeout: 15000,
        retries: 0,
        onFailure: 'abort',
      },
    ],
    edges: [],
    inputParameters: [],
    extractionTargets: [],
  };
}

function recorderControllerFixture(): RecorderController {
  const now = new Date().toISOString();
  const sessions = new Map<string, RecorderSessionRecord>();
  const actions = new Map<string, RecorderActionRecord[]>();

  return {
    async createSession(input) {
      const session: RecorderSessionRecord = {
        id: 'rec-1',
        name: input.name ?? null,
        status: 'active',
        startUrl: input.url,
        currentUrl: input.url,
        firecrawlSessionId: 'fc-123',
        liveViewUrl: 'https://liveview.example.com/fc-123',
        createdAt: now,
        updatedAt: now,
        finishedAt: null,
      };
      sessions.set(session.id, session);
      actions.set(session.id, []);
      return {
        session,
        initialDiscovery: createDiscoveryFixture(),
      };
    },
    async listSessions() {
      return { items: [...sessions.values()] };
    },
    async getSession(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        return null;
      }
      return { session, lastDiscovery: createDiscoveryFixture() };
    },
    async addAction(sessionId, action: RecorderActionInput) {
      const session = sessions.get(sessionId);
      if (!session) {
        return null;
      }
      const list = actions.get(sessionId) ?? [];
      const record: RecorderActionRecord = {
        id: list.length + 1,
        sessionId,
        seq: list.length + 1,
        type: action.type,
        input: action,
        output: null,
        error: null,
        createdAt: now,
      };
      list.push(record);
      actions.set(sessionId, list);
      return { action: record, lastDiscovery: createDiscoveryFixture() };
    },
    async listActions(input) {
      return { items: actions.get(input.sessionId) ?? [] };
    },
    async finalizeSession(input) {
      const session = sessions.get(input.sessionId);
      if (!session) {
        return null;
      }
      return {
        workflow: workflowFixture('wf-rec-finalized'),
        issues: [],
        warnings: [],
        ...(input.register ? { registeredWorkflowId: 'wf-rec-finalized' } : {}),
      };
    },
    async stopSession(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        return null;
      }
      const updated: RecorderSessionRecord = {
        ...session,
        status: 'stopped',
        finishedAt: now,
      };
      sessions.set(sessionId, updated);
      return updated;
    },
    async cleanupIdleSessions() {
      return 0;
    },
  };
}

interface Harness {
  server: Awaited<ReturnType<typeof createFireAPIServerInternal>>;
  runDbClient: ReturnType<typeof createDatabaseClient>;
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
      fatal: () => undefined,
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined,
      debug: () => undefined,
      trace: () => undefined,
      child: () => ({
        fatal: () => undefined,
        error: () => undefined,
        warn: () => undefined,
        info: () => undefined,
        debug: () => undefined,
        trace: () => undefined,
      }),
      level: 'info',
      silent: () => undefined,
      bindings: () => ({}),
    } as never,
    pollIntervalMs: 10,
    runnerConcurrency: 1,
  });

  const server = await createFireAPIServerInternal(
    {
      databaseUrl: ':memory:',
      autoMigrate: true,
      firecrawlApiKey: '',
    },
    {
      runService,
      pageDiscovery: {
        discover: async () => ({ ok: true, data: createDiscoveryFixture() }),
      } as never,
      recorderController: recorderControllerFixture(),
      authProvider: {
        authorize: async () => undefined,
      },
    },
  );

  await server.app.ready();
  return { server, runDbClient };
}

describe('Recorder API routes', () => {
  it('creates sessions, records actions, finalizes, and stops', async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const created = await harness.server.app.inject({
      method: 'POST',
      url: '/v1/recorder/sessions',
      payload: { url: 'https://example.com/search', name: 'My Session' },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().session.id).toBe('rec-1');

    const action = await harness.server.app.inject({
      method: 'POST',
      url: '/v1/recorder/sessions/rec-1/actions',
      payload: {
        type: 'click',
        selectors: [{ type: 'css', value: 'button.submit', confidence: 0.9 }],
      },
    });
    expect(action.statusCode).toBe(200);
    expect(action.json().action.seq).toBe(1);

    const finalized = await harness.server.app.inject({
      method: 'POST',
      url: '/v1/recorder/sessions/rec-1/finalize',
      payload: { register: true },
    });
    expect(finalized.statusCode).toBe(200);
    expect(finalized.json().workflow.id).toBe('wf-rec-finalized');
    expect(finalized.json().registeredWorkflowId).toBe('wf-rec-finalized');

    const stopped = await harness.server.app.inject({
      method: 'POST',
      url: '/v1/recorder/sessions/rec-1/stop',
    });
    expect(stopped.statusCode).toBe(200);
    expect(stopped.json().status).toBe('stopped');
  });

  it('returns dashboard overview payload', async () => {
    const harness = await createHarness();
    harnesses.push(harness);

    const overview = await harness.server.app.inject({
      method: 'GET',
      url: '/v1/dashboard/overview',
    });

    expect(overview.statusCode).toBe(200);
    const payload = overview.json();
    expect(payload).toMatchObject({
      workflowsTotal: expect.any(Number),
      activeRecorderSessions: expect.any(Number),
      runsByStatus: {
        queued: expect.any(Number),
        running: expect.any(Number),
        succeeded: expect.any(Number),
        failed: expect.any(Number),
        cancelled: expect.any(Number),
      },
    });
    expect(Array.isArray(payload.recentRuns)).toBe(true);
  });
});
