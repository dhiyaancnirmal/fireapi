import { afterEach, describe, expect, it } from 'vitest';

import { createDatabaseClient } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { RunRepository } from '../../src/db/repositories/run-repository.js';
import { createValidWorkflow } from '../fixtures/workflow.js';

const clients: Array<ReturnType<typeof createDatabaseClient>> = [];

function createRepo() {
  const client = createDatabaseClient(':memory:');
  clients.push(client);
  runMigrations(client.sqlite);
  return new RunRepository(client);
}

afterEach(() => {
  while (clients.length > 0) {
    clients.pop()?.close();
  }
});

describe('RunRepository', () => {
  it('creates queued run and claims oldest item', async () => {
    const repo = createRepo();

    await repo.createQueued({
      workflowSnapshot: createValidWorkflow('wf-1'),
      input: { query: 'alpha' },
      name: 'first',
    });
    const second = await repo.createQueued({
      workflowSnapshot: createValidWorkflow('wf-2'),
      input: { query: 'beta' },
      name: 'second',
    });

    const claimedOne = await repo.claimNextQueued();
    const claimedTwo = await repo.claimNextQueued();

    expect(claimedOne?.status).toBe('running');
    expect(claimedTwo?.id).toBe(second.id);
    expect(claimedTwo?.status).toBe('running');
  });

  it('marks run succeeded and persists result payload', async () => {
    const repo = createRepo();
    const created = await repo.createQueued({
      workflowSnapshot: createValidWorkflow('wf-success'),
      input: { query: 'gamma' },
    });

    await repo.markSucceeded(created.id, { success: true, data: { rows: 1 } }, [
      { type: 'execution_end', timestamp: new Date().toISOString() },
    ]);

    const fetched = await repo.getById(created.id);
    expect(fetched?.status).toBe('succeeded');
    expect(fetched?.result).toMatchObject({ success: true });
    expect(Array.isArray(fetched?.trace)).toBe(true);
  });

  it('cancels queued run', async () => {
    const repo = createRepo();
    const created = await repo.createQueued({
      workflowSnapshot: createValidWorkflow('wf-cancel'),
      input: { query: 'delta' },
    });

    const cancelled = await repo.markCancelled(created.id);
    expect(cancelled).toBe(true);

    const fetched = await repo.getById(created.id);
    expect(fetched?.status).toBe('cancelled');
  });
});
