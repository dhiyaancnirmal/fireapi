import { describe, expect, it, vi } from 'vitest';

import type { BrowserLease, Result } from '@fireapi/browser';
import { BrowserWorkflowRuntime } from '../../src/index.js';

function makeLease(): BrowserLease {
  const page = {
    goto: vi.fn(async () => undefined),
    waitForLoadState: vi.fn(async () => undefined),
    locator: vi.fn(() => ({
      first: () => ({
        locator: () => ({
          evaluateAll: async () => ['a', 'b'],
        }),
      }),
      evaluateAll: async () => ['a', 'b'],
    })),
  };

  return {
    session: {
      id: 'session-1',
      cdpUrl: 'wss://cdp.local',
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      useCount: 0,
    },
    browser: {} as never,
    context: {} as never,
    page: page as never,
  };
}

describe('BrowserWorkflowRuntime', () => {
  it('acquires and releases lease via session manager', async () => {
    const lease = makeLease();
    const acquire = vi.fn(
      async (): Promise<Result<BrowserLease, Error>> => ({ ok: true, data: lease }),
    );
    const release = vi.fn(async () => undefined);

    const runtime = new BrowserWorkflowRuntime({ sessionManager: { acquire, release } });
    const init = await runtime.init();

    expect(init.ok).toBe(true);
    await runtime.close();
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('delegates interactions to provided interaction adapter', async () => {
    const lease = makeLease();
    const fill = vi.fn(async () => ({ ok: true, data: undefined }));

    const runtime = new BrowserWorkflowRuntime({
      lease,
      interaction: {
        fill,
        select: vi.fn(async () => ({ ok: true, data: undefined })),
        click: vi.fn(async () => ({ ok: true, data: undefined })),
        waitFor: vi.fn(async () => ({ ok: true, data: undefined })),
        extractText: vi.fn(async () => ({ ok: true, data: 'x' })),
        extractAttribute: vi.fn(async () => ({ ok: true, data: 'x' })),
        extractTable: vi.fn(async () => ({
          ok: true,
          data: { headers: [], rows: [], rowCount: 0 },
        })),
      } as never,
    });

    const result = await runtime.fill([{ type: 'css', value: '#q', confidence: 1 }], 'books');
    expect(result.ok).toBe(true);
    expect(fill).toHaveBeenCalledTimes(1);
  });

  it('returns init error with no lease and no session manager', async () => {
    const runtime = new BrowserWorkflowRuntime({});
    const result = await runtime.init();

    expect(result.ok).toBe(false);
  });
});
