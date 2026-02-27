import { FirecrawlSessionManager } from '../../src/session/firecrawl-session-manager.js';
import type {
  BrowserConnector,
  FirecrawlBrowserApiClient,
} from '../../src/session/session-types.js';
import type { FirecrawlBrowserSessionResponse } from '../../src/types.js';

class FakePage {}

class FakeContext {
  private readonly page = new FakePage();
  pages() {
    return [this.page] as unknown[];
  }
  async newPage() {
    return this.page as unknown;
  }
}

class FakeBrowser {
  closed = false;
  private readonly context = new FakeContext();
  contexts() {
    return [this.context] as unknown[];
  }
  async newContext() {
    return this.context as unknown;
  }
  async close() {
    this.closed = true;
  }
}

class FakeClient implements FirecrawlBrowserApiClient {
  created: FirecrawlBrowserSessionResponse[] = [];
  deleted: string[] = [];
  private count = 0;

  async createSession(): Promise<FirecrawlBrowserSessionResponse> {
    this.count += 1;
    const session = {
      id: `session-${this.count}`,
      cdpUrl: `ws://fake/${this.count}`,
      liveViewUrl: `http://live/${this.count}`,
    };
    this.created.push(session);
    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.deleted.push(sessionId);
  }
}

class FakeConnector implements BrowserConnector {
  async connectOverCDP(): Promise<unknown> {
    return new FakeBrowser();
  }
}

function makeManager(client = new FakeClient()): {
  manager: FirecrawlSessionManager;
  client: FakeClient;
} {
  const manager = new FirecrawlSessionManager(
    {
      apiKey: 'test',
      maxConcurrentSessions: 1,
      warmPoolSize: 0,
      sessionTtlSeconds: 60,
      activityTtlSeconds: 30,
      maxUsesPerSession: 10,
      acquireTimeoutMs: 1000,
      maxQueueSize: 2,
    },
    {
      client,
      connector: new FakeConnector(),
    },
  );
  return { manager, client };
}

describe('FirecrawlSessionManager', () => {
  it('queues acquire requests and serves them when a lease is released', async () => {
    const { manager } = makeManager();
    const first = await manager.acquire();
    expect(first.ok).toBe(true);

    const secondPromise = manager.acquire();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(manager.stats().waitQueueSize).toBe(1);

    if (first.ok) {
      await manager.release(first.data, 'ok');
    }

    const second = await secondPromise;
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.data.session.id).toBe(first.data.session.id);
    }

    if (second.ok) {
      await manager.release(second.data, 'ok');
    }
    await manager.destroyAll();
  });

  it('destroys a session when released with error outcome', async () => {
    const { manager, client } = makeManager();
    const lease = await manager.acquire();
    expect(lease.ok).toBe(true);

    if (lease.ok) {
      const sessionId = lease.data.session.id;
      await manager.release(lease.data, 'error');
      expect(client.deleted).toContain(sessionId);
    }

    await manager.destroyAll();
  });
});
