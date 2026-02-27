import { afterEach, describe, expect, it } from 'vitest';

import { createDatabaseClient } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { WorkflowRepository } from '../../src/db/repositories/workflow-repository.js';
import { createValidWorkflow } from '../fixtures/workflow.js';

const openedClients: Array<ReturnType<typeof createDatabaseClient>> = [];

function createRepo() {
  const client = createDatabaseClient(':memory:');
  openedClients.push(client);
  runMigrations(client.sqlite);
  return {
    repo: new WorkflowRepository(client),
    close: () => client.close(),
  };
}

afterEach(() => {
  while (openedClients.length > 0) {
    const client = openedClients.pop();
    client?.close();
  }
});

describe('WorkflowRepository', () => {
  it('registers and fetches workflow by id', async () => {
    const { repo } = createRepo();
    const workflow = createValidWorkflow('wf-register');

    const registered = await repo.register({ workflow, name: 'My Workflow' });
    expect(registered.id).toBe('wf-register');
    expect(registered.name).toBe('My Workflow');

    const fetched = await repo.getById(registered.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.graph.id).toBe('wf-register');
    expect(fetched?.hash).toBe(registered.hash);
  });

  it('deduplicates registration by workflow hash', async () => {
    const { repo } = createRepo();
    const workflow = createValidWorkflow('wf-hash-a');

    const first = await repo.register({ workflow, name: 'A' });
    const second = await repo.register({ workflow, name: 'B' });

    expect(second.id).toBe(first.id);
    expect(second.hash).toBe(first.hash);
  });
});
