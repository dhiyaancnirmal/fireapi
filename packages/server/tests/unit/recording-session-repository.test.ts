import { afterEach, describe, expect, it } from 'vitest';

import { createDatabaseClient } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { RecordingSessionRepository } from '../../src/db/repositories/recording-session-repository.js';
import { createDiscoveryFixture } from '../fixtures/discovery.js';
import { createValidWorkflow } from '../fixtures/workflow.js';

const clients: Array<ReturnType<typeof createDatabaseClient>> = [];

function createRepo() {
  const client = createDatabaseClient(':memory:');
  clients.push(client);
  runMigrations(client.sqlite);
  return new RecordingSessionRepository(client);
}

afterEach(() => {
  while (clients.length > 0) {
    clients.pop()?.close();
  }
});

describe('RecordingSessionRepository', () => {
  it('creates and fetches recorder session details', async () => {
    const repo = createRepo();

    const created = await repo.create({
      name: 'Session A',
      startUrl: 'https://example.com/search',
      firecrawlSessionId: 'fc-1',
      liveViewUrl: 'https://liveview.example.com/fc-1',
      lastDiscovery: createDiscoveryFixture(),
    });

    expect(created.session.id).toBeDefined();
    expect(created.session.status).toBe('active');
    expect(created.lastDiscovery?.url).toBe('https://example.com/search');

    const fetched = await repo.getById(created.session.id);
    expect(fetched?.session.name).toBe('Session A');
    expect(fetched?.session.firecrawlSessionId).toBe('fc-1');
  });

  it('updates status and draft workflow', async () => {
    const repo = createRepo();

    const created = await repo.create({
      startUrl: 'https://example.com/search',
      firecrawlSessionId: 'fc-2',
      liveViewUrl: 'https://liveview.example.com/fc-2',
    });

    const updated = await repo.update({
      id: created.session.id,
      status: 'finalized',
      draftWorkflow: createValidWorkflow('wf-recorded'),
      finishedAt: new Date().toISOString(),
    });

    expect(updated?.session.status).toBe('finalized');
    expect(updated?.draftWorkflow?.id).toBe('wf-recorded');
  });

  it('lists sessions with status filter', async () => {
    const repo = createRepo();

    const first = await repo.create({
      startUrl: 'https://example.com/a',
      firecrawlSessionId: 'fc-3',
      liveViewUrl: 'https://liveview.example.com/fc-3',
    });

    await repo.create({
      startUrl: 'https://example.com/b',
      firecrawlSessionId: 'fc-4',
      liveViewUrl: 'https://liveview.example.com/fc-4',
    });

    await repo.update({
      id: first.session.id,
      status: 'stopped',
      finishedAt: new Date().toISOString(),
    });

    const active = await repo.list({ status: 'active' });
    const stopped = await repo.list({ status: 'stopped' });

    expect(active.items).toHaveLength(1);
    expect(stopped.items).toHaveLength(1);
    expect(stopped.items[0]?.id).toBe(first.session.id);
  });
});
