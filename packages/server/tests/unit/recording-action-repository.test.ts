import { afterEach, describe, expect, it } from 'vitest';

import { createDatabaseClient } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { RecordingActionRepository } from '../../src/db/repositories/recording-action-repository.js';
import { RecordingSessionRepository } from '../../src/db/repositories/recording-session-repository.js';

const clients: Array<ReturnType<typeof createDatabaseClient>> = [];

function createRepos() {
  const client = createDatabaseClient(':memory:');
  clients.push(client);
  runMigrations(client.sqlite);
  return {
    sessions: new RecordingSessionRepository(client),
    actions: new RecordingActionRepository(client),
  };
}

afterEach(() => {
  while (clients.length > 0) {
    clients.pop()?.close();
  }
});

describe('RecordingActionRepository', () => {
  it('appends actions with incrementing seq per session', async () => {
    const { sessions, actions } = createRepos();

    const session = await sessions.create({
      startUrl: 'https://example.com/start',
      firecrawlSessionId: 'fc-10',
      liveViewUrl: 'https://liveview.example.com/fc-10',
    });

    const first = await actions.append({
      sessionId: session.session.id,
      action: {
        type: 'navigate',
        url: 'https://example.com/start',
      },
    });

    const second = await actions.append({
      sessionId: session.session.id,
      action: {
        type: 'click',
        selectors: [{ type: 'css', value: 'button.search', confidence: 0.9 }],
      },
    });

    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
  });

  it('lists actions in ascending sequence with cursor paging', async () => {
    const { sessions, actions } = createRepos();

    const session = await sessions.create({
      startUrl: 'https://example.com/start',
      firecrawlSessionId: 'fc-11',
      liveViewUrl: 'https://liveview.example.com/fc-11',
    });

    for (let index = 0; index < 3; index += 1) {
      await actions.append({
        sessionId: session.session.id,
        action: {
          type: 'wait',
          condition: 'timeout',
          value: 10,
        },
      });
    }

    const pageOne = await actions.list({
      sessionId: session.session.id,
      limit: 2,
      ascending: true,
    });
    expect(pageOne.items).toHaveLength(2);
    expect(pageOne.items[0]?.seq).toBe(1);

    const pageTwo = await actions.list({
      sessionId: session.session.id,
      limit: 2,
      cursor: pageOne.nextCursor,
      ascending: true,
    });
    expect(pageTwo.items).toHaveLength(1);
    expect(pageTwo.items[0]?.seq).toBe(3);
  });
});
