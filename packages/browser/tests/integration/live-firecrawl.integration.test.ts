import { PageDiscovery } from '../../src/discovery/page-discovery.js';
import { FirecrawlSessionManager } from '../../src/session/firecrawl-session-manager.js';
import type { BrowserLease } from '../../src/types.js';

const runLive = Boolean(process.env.FIRECRAWL_API_KEY);
const describeLive = runLive ? describe : describe.skip;
const PUBLIC_DISCOVERY_URL = 'https://example.com/';

describeLive('Live Firecrawl Browser Sandbox integration', () => {
  it('acquires and reuses a session, then runs discovery against a public URL', async () => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new Error('FIRECRAWL_API_KEY is required for live integration test');
    }

    const manager = new FirecrawlSessionManager({
      apiKey,
      maxConcurrentSessions: 1,
      warmPoolSize: 0,
      sessionTtlSeconds: 120,
      activityTtlSeconds: 60,
      maxUsesPerSession: 5,
      acquireTimeoutMs: 10000,
      maxQueueSize: 1,
    });

    let firstLease: BrowserLease | null = null;
    let secondLease: BrowserLease | null = null;

    try {
      const first = await manager.acquire();
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      firstLease = first.data;
      const firstId = first.data.session.id;
      await manager.release(first.data, 'ok');
      firstLease = null;

      const second = await manager.acquire();
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      secondLease = second.data;
      expect(second.data.session.id).toBe(firstId);
      await manager.release(second.data, 'ok');
      secondLease = null;

      const discovery = new PageDiscovery();
      const result = await discovery.discover({
        url: PUBLIC_DISCOVERY_URL,
        sessionManager: manager,
        includeTables: true,
        includePagination: true,
        detectDependencies: false,
      });

      if (!result.ok) {
        throw new Error(
          `Live discovery failed: ${result.error.message} ${JSON.stringify(result.error.details ?? {})}`,
        );
      }

      expect(result.data.url).toContain('example.com');
      expect(Array.isArray(result.data.elements)).toBe(true);
      expect(Array.isArray(result.data.tables)).toBe(true);
      expect(Array.isArray(result.data.paginationControls)).toBe(true);
    } finally {
      if (secondLease) {
        await manager.release(secondLease, 'ok');
      }
      if (firstLease) {
        await manager.release(firstLease, 'error');
      }
      await manager.destroyAll();
    }
  });
});
