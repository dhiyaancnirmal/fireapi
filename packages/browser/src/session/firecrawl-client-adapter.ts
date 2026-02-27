import Firecrawl from '@mendable/firecrawl-js';

import type { FirecrawlBrowserSessionResponse } from '../types.js';
import type { FirecrawlBrowserApiClient } from './session-types.js';

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }
  return {};
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

export class FirecrawlClientAdapter implements FirecrawlBrowserApiClient {
  private readonly client: unknown;

  constructor(apiKey: string) {
    this.client = new Firecrawl({ apiKey }) as unknown;
  }

  async createSession(options: {
    ttl: number;
    activityTtl: number;
  }): Promise<FirecrawlBrowserSessionResponse> {
    const clientRecord = asRecord(this.client);
    const browserMethod = clientRecord.browser;
    if (typeof browserMethod !== 'function') {
      throw new Error('Firecrawl SDK missing browser() method');
    }

    const response = await (browserMethod as (...args: unknown[]) => Promise<unknown>).call(
      this.client,
      {
        ttl: options.ttl,
        activityTtl: options.activityTtl,
      },
    );

    const record = asRecord(response);
    const id = getString(record, 'id');
    const cdpUrl = getString(record, 'cdpUrl');
    const liveViewUrl = getString(record, 'liveViewUrl');

    if (!id || !cdpUrl) {
      throw new Error('Unexpected Firecrawl browser session response');
    }

    return liveViewUrl ? { id, cdpUrl, liveViewUrl } : { id, cdpUrl };
  }

  async deleteSession(sessionId: string): Promise<void> {
    const clientRecord = asRecord(this.client);
    const deleteMethod =
      clientRecord.deleteBrowserSession ?? clientRecord.browserDelete ?? clientRecord.deleteSession;
    if (typeof deleteMethod !== 'function') {
      return;
    }

    await (deleteMethod as (...args: unknown[]) => Promise<unknown>).call(this.client, sessionId);
  }
}
