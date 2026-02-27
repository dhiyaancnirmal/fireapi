import { type Browser, type BrowserContext, type Page, chromium } from 'playwright-core';

import { SessionError } from '../errors.js';
import { createBrowserLogger } from '../logger.js';
import type {
  BrowserLease,
  BrowserPackageLogger,
  FirecrawlSessionManagerOptions,
  FirecrawlSessionRecord,
  Result,
  SessionPoolStats,
} from '../types.js';
import { FirecrawlClientAdapter } from './firecrawl-client-adapter.js';
import type {
  BrowserConnector,
  FirecrawlBrowserApiClient,
  InternalSessionState,
  SessionManagerDeps,
} from './session-types.js';

interface QueueWaiter {
  resolve: (result: Result<BrowserLease, SessionError>) => void;
  timer: NodeJS.Timeout;
}

class PlaywrightConnector implements BrowserConnector {
  async connectOverCDP(cdpUrl: string): Promise<Browser> {
    return chromium.connectOverCDP(cdpUrl);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function toLease(state: InternalSessionState): BrowserLease {
  const sessionBase = {
    id: state.sessionId,
    cdpUrl: state.cdpUrl,
    createdAt: state.createdAt,
    lastUsedAt: state.lastUsedAt,
    useCount: state.useCount,
  };
  const session: FirecrawlSessionRecord = state.liveViewUrl
    ? { ...sessionBase, liveViewUrl: state.liveViewUrl }
    : sessionBase;

  return {
    session,
    browser: state.browser,
    context: state.context,
    page: state.page,
  };
}

async function safelyCloseBrowser(browser: Browser, logger?: BrowserPackageLogger): Promise<void> {
  try {
    await browser.close();
  } catch (error) {
    logger?.warn?.({ err: error }, 'Failed to close browser');
  }
}

export class FirecrawlSessionManager {
  private readonly options: FirecrawlSessionManagerOptions;
  private readonly client: FirecrawlBrowserApiClient;
  private readonly connector: BrowserConnector;
  private readonly logger: BrowserPackageLogger;
  private readonly sessions = new Map<string, InternalSessionState>();
  private readonly idleSessionIds: string[] = [];
  private readonly waitQueue: QueueWaiter[] = [];

  constructor(options: FirecrawlSessionManagerOptions, deps?: Partial<SessionManagerDeps>) {
    this.options = options;
    this.client = deps?.client ?? new FirecrawlClientAdapter(options.apiKey);
    this.connector = deps?.connector ?? new PlaywrightConnector();
    this.logger = deps?.logger ?? options.logger ?? createBrowserLogger();
  }

  async warm(): Promise<void> {
    const target = Math.min(this.options.warmPoolSize, this.options.maxConcurrentSessions);
    const missing = Math.max(0, target - this.idleSessionIds.length);
    for (let index = 0; index < missing; index += 1) {
      try {
        const state = await this.createSessionState();
        this.sessions.set(state.sessionId, state);
        this.idleSessionIds.push(state.sessionId);
      } catch (error) {
        this.logger.warn?.({ err: error }, 'Warm session creation failed');
      }
    }
  }

  async acquire(): Promise<Result<BrowserLease, SessionError>> {
    const idle = this.popNextIdle();
    if (idle) {
      return { ok: true, data: toLease(idle) };
    }

    if (this.sessions.size < this.options.maxConcurrentSessions) {
      try {
        const state = await this.createSessionState();
        this.sessions.set(state.sessionId, state);
        state.inUse = true;
        state.lastUsedAt = nowIso();
        state.useCount += 1;
        return { ok: true, data: toLease(state) };
      } catch (error) {
        return {
          ok: false,
          error: new SessionError('Failed to create Firecrawl session', {
            cause: error instanceof Error ? error.message : String(error),
          }),
        };
      }
    }

    if (this.waitQueue.length >= this.options.maxQueueSize) {
      return {
        ok: false,
        error: new SessionError('Server at capacity', {
          queueSize: this.waitQueue.length,
          maxQueueSize: this.options.maxQueueSize,
        }),
      };
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const index = this.waitQueue.findIndex((w) => w.timer === timer);
        if (index >= 0) {
          this.waitQueue.splice(index, 1);
        }
        resolve({
          ok: false,
          error: new SessionError('Timed out waiting for an available session', {
            timeoutMs: this.options.acquireTimeoutMs,
          }),
        });
      }, this.options.acquireTimeoutMs);

      this.waitQueue.push({ resolve, timer });
    });
  }

  async release(lease: BrowserLease, outcome: 'ok' | 'error' = 'ok'): Promise<void> {
    const state = this.sessions.get(lease.session.id);
    if (!state) {
      return;
    }

    state.inUse = false;
    state.lastUsedAt = nowIso();

    if (outcome === 'error' || state.useCount >= this.options.maxUsesPerSession) {
      await this.destroyState(state);
      await this.flushWaitQueue();
      return;
    }

    const waiter = this.waitQueue.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      state.inUse = true;
      state.lastUsedAt = nowIso();
      state.useCount += 1;
      waiter.resolve({ ok: true, data: toLease(state) });
      return;
    }

    this.idleSessionIds.push(state.sessionId);
  }

  async destroySession(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return;
    }
    await this.destroyState(state);
    await this.flushWaitQueue();
  }

  async destroyAll(): Promise<void> {
    const current = [...this.sessions.values()];
    for (const state of current) {
      await this.destroyState(state);
    }

    while (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift();
      if (!waiter) {
        continue;
      }
      clearTimeout(waiter.timer);
      waiter.resolve({
        ok: false,
        error: new SessionError('Session manager shutdown while waiting for a session'),
      });
    }
  }

  stats(): SessionPoolStats {
    const idleSessions = this.idleSessionIds.length;
    return {
      totalSessions: this.sessions.size,
      idleSessions,
      leasedSessions: this.sessions.size - idleSessions,
      waitQueueSize: this.waitQueue.length,
      maxConcurrentSessions: this.options.maxConcurrentSessions,
    };
  }

  private popNextIdle(): InternalSessionState | null {
    while (this.idleSessionIds.length > 0) {
      const sessionId = this.idleSessionIds.pop();
      if (!sessionId) {
        continue;
      }
      const state = this.sessions.get(sessionId);
      if (!state) {
        continue;
      }
      state.inUse = true;
      state.lastUsedAt = nowIso();
      state.useCount += 1;
      return state;
    }
    return null;
  }

  private async createSessionState(): Promise<InternalSessionState> {
    const created = await this.client.createSession({
      ttl: this.options.sessionTtlSeconds,
      activityTtl: this.options.activityTtlSeconds,
    });

    const browser = await this.connector.connectOverCDP(created.cdpUrl);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    const timestamp = nowIso();

    const stateBase = {
      sessionId: created.id,
      cdpUrl: created.cdpUrl,
      browser,
      context,
      page,
      createdAt: timestamp,
      lastUsedAt: timestamp,
      useCount: 0,
      inUse: false,
    };
    const state: InternalSessionState = created.liveViewUrl
      ? { ...stateBase, liveViewUrl: created.liveViewUrl }
      : stateBase;

    this.logger.info?.({ sessionId: created.id }, 'Created Firecrawl browser session');
    return state;
  }

  private async destroyState(state: InternalSessionState): Promise<void> {
    this.sessions.delete(state.sessionId);
    this.removeIdleId(state.sessionId);
    await safelyCloseBrowser(state.browser, this.logger);
    try {
      await this.client.deleteSession?.(state.sessionId);
    } catch (error) {
      this.logger.warn?.(
        { err: error, sessionId: state.sessionId },
        'Failed to delete Firecrawl session',
      );
    }
  }

  private removeIdleId(sessionId: string): void {
    const index = this.idleSessionIds.indexOf(sessionId);
    if (index >= 0) {
      this.idleSessionIds.splice(index, 1);
    }
  }

  private async flushWaitQueue(): Promise<void> {
    while (this.waitQueue.length > 0 && this.idleSessionIds.length > 0) {
      const waiter = this.waitQueue.shift();
      if (!waiter) {
        break;
      }
      clearTimeout(waiter.timer);
      const idle = this.popNextIdle();
      if (idle) {
        waiter.resolve({ ok: true, data: toLease(idle) });
      }
    }
  }
}
