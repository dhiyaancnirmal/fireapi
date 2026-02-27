import type { Browser, BrowserContext, Page } from 'playwright-core';

import type { BrowserPackageLogger, FirecrawlBrowserSessionResponse } from '../types.js';

export interface FirecrawlBrowserApiClient {
  createSession(options: {
    ttl: number;
    activityTtl: number;
  }): Promise<FirecrawlBrowserSessionResponse>;
  deleteSession?(sessionId: string): Promise<void>;
}

export interface BrowserConnector {
  connectOverCDP(cdpUrl: string): Promise<Browser>;
}

export interface InternalSessionState {
  sessionId: string;
  cdpUrl: string;
  liveViewUrl?: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: string;
  lastUsedAt: string;
  useCount: number;
  inUse: boolean;
}

export interface SessionManagerDeps {
  client: FirecrawlBrowserApiClient;
  connector: BrowserConnector;
  logger?: BrowserPackageLogger;
}
