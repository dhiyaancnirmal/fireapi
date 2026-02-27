import type {
  BrowserLease,
  FirecrawlSessionManager,
  PageDiscovery,
  Result,
  SelectorStrategy,
} from '@fireapi/browser';
import { BrowserWorkflowRuntime, type WorkflowValidationIssue } from '@fireapi/core';
import {
  type RecorderActionInput,
  type RecorderActionRecord,
  RecorderError,
  RecorderService,
  type RecorderSessionRecord,
} from '@fireapi/recorder';
import type { Logger } from 'pino';

import type { RecordingActionRepository } from '../db/repositories/recording-action-repository.js';
import type {
  RecordingSessionDetails,
  RecordingSessionRepository,
} from '../db/repositories/recording-session-repository.js';
import type { WorkflowRepository } from '../db/repositories/workflow-repository.js';
import { ServerError } from '../errors.js';
import type {
  RecorderActionCreateResponse,
  RecorderController,
  RecorderSessionCreateResponse,
  RecorderSessionFinalizeResponse,
  RecorderSessionGetResponse,
} from '../types.js';

function resultOrThrow<T>(result: Result<T, Error>, details?: Record<string, unknown>): T {
  if (result.ok) {
    return result.data;
  }
  throw new ServerError(
    result.error.message,
    result.error instanceof RecorderError ? result.error.code : 'RECORDER_ACTION_FAILED',
    400,
    {
      ...(details ?? {}),
      cause: result.error.message,
    },
  );
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { message: error.message };
  }
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    return error as Record<string, unknown>;
  }
  return { message: String(error) };
}

function selectorsForWait(action: {
  condition: 'selector' | 'networkidle' | 'timeout';
  selectors?: SelectorStrategy[];
}): SelectorStrategy[] {
  if (action.condition === 'selector') {
    return action.selectors ?? [];
  }
  return [];
}

interface ActiveRecorderSession {
  lease: BrowserLease;
  runtime: BrowserWorkflowRuntime;
  touchedAt: number;
}

export interface FirecrawlRecorderServiceOptions {
  logger: Logger;
  recorderService?: RecorderService;
  pageDiscovery: PageDiscovery;
  sessionManager?: FirecrawlSessionManager;
  sessionRepository: RecordingSessionRepository;
  actionRepository: RecordingActionRepository;
  workflowRepository: WorkflowRepository;
  maxActiveSessions: number;
  actionTimeoutMs: number;
  idleSessionTtlMs: number;
}

export class FirecrawlRecorderService implements RecorderController {
  private readonly logger: Logger;
  private readonly recorderService: RecorderService;
  private readonly pageDiscovery: PageDiscovery;
  private readonly sessionManager: FirecrawlSessionManager | undefined;
  private readonly sessionRepository: RecordingSessionRepository;
  private readonly actionRepository: RecordingActionRepository;
  private readonly workflowRepository: WorkflowRepository;
  private readonly maxActiveSessions: number;
  private readonly actionTimeoutMs: number;
  private readonly idleSessionTtlMs: number;
  private readonly activeSessions = new Map<string, ActiveRecorderSession>();

  constructor(options: FirecrawlRecorderServiceOptions) {
    this.logger = options.logger;
    this.recorderService = options.recorderService ?? new RecorderService();
    this.pageDiscovery = options.pageDiscovery;
    this.sessionManager = options.sessionManager;
    this.sessionRepository = options.sessionRepository;
    this.actionRepository = options.actionRepository;
    this.workflowRepository = options.workflowRepository;
    this.maxActiveSessions = options.maxActiveSessions;
    this.actionTimeoutMs = options.actionTimeoutMs;
    this.idleSessionTtlMs = options.idleSessionTtlMs;
  }

  async createSession(input: {
    url: string;
    name?: string;
  }): Promise<RecorderSessionCreateResponse> {
    if (!this.sessionManager) {
      throw new ServerError(
        'Recorder requires firecrawlApiKey/server session manager configuration',
        'RECORDER_NOT_CONFIGURED',
        503,
      );
    }

    if (this.activeSessions.size >= this.maxActiveSessions) {
      throw new ServerError('Recorder active session limit reached', 'RECORDER_CAPACITY', 429, {
        maxActiveSessions: this.maxActiveSessions,
      });
    }

    const acquired = await this.sessionManager.acquire();
    if (!acquired.ok) {
      throw new ServerError(
        'Failed to acquire browser session for recorder',
        'RECORDER_SESSION',
        503,
        {
          cause: acquired.error.message,
        },
      );
    }

    const lease = acquired.data;
    const runtime = new BrowserWorkflowRuntime({ lease });
    const initialized = await runtime.init();
    if (!initialized.ok) {
      await this.sessionManager.release(lease, 'error');
      throw new ServerError('Failed to initialize recorder runtime', 'RECORDER_RUNTIME_INIT', 503, {
        cause: initialized.error.message,
      });
    }

    const navigated = await runtime.navigate(input.url, { timeoutMs: this.actionTimeoutMs });
    if (!navigated.ok) {
      await this.sessionManager.release(lease, 'error');
      throw new ServerError('Failed to navigate recorder session', 'RECORDER_NAVIGATE', 400, {
        cause: navigated.error.message,
      });
    }

    const currentUrl = lease.page.url() || input.url;
    const discoveryResult = await this.pageDiscovery.discoverFromPage(lease.page, {
      url: currentUrl,
      timeoutMs: this.actionTimeoutMs,
      includeTables: true,
      includePagination: true,
      detectDependencies: true,
    });

    if (!discoveryResult.ok) {
      await this.sessionManager.release(lease, 'error');
      throw new ServerError('Failed initial recorder discovery', 'RECORDER_DISCOVERY_FAILED', 502, {
        cause: discoveryResult.error.message,
      });
    }

    const created = await this.sessionRepository.create({
      ...(input.name ? { name: input.name } : {}),
      startUrl: input.url,
      currentUrl,
      firecrawlSessionId: lease.session.id,
      liveViewUrl: lease.session.liveViewUrl ?? '',
      lastDiscovery: discoveryResult.data,
    });

    this.activeSessions.set(created.session.id, {
      lease,
      runtime,
      touchedAt: Date.now(),
    });

    this.logger.info(
      {
        recorderSessionId: created.session.id,
        firecrawlSessionId: created.session.firecrawlSessionId,
      },
      'Recorder session created',
    );

    return {
      session: created.session,
      initialDiscovery: discoveryResult.data,
    };
  }

  async listSessions(input: {
    status?: RecorderSessionRecord['status'];
    limit?: number;
    cursor?: string;
  }): Promise<{ items: RecorderSessionRecord[]; nextCursor?: string }> {
    return this.sessionRepository.list(input);
  }

  async getSession(sessionId: string): Promise<RecorderSessionGetResponse | null> {
    const session = await this.sessionRepository.getById(sessionId);
    if (!session) {
      return null;
    }
    return {
      session: session.session,
      ...(session.lastDiscovery ? { lastDiscovery: session.lastDiscovery } : {}),
    };
  }

  async addAction(
    sessionId: string,
    action: RecorderActionInput,
  ): Promise<RecorderActionCreateResponse | null> {
    const current = await this.requireActiveSession(sessionId);
    if (!current) {
      return null;
    }

    const handle = this.activeSessions.get(sessionId);
    if (!handle) {
      throw new ServerError(
        'Recorder session is not attached to an active runtime',
        'RECORDER_SESSION_NOT_ATTACHED',
        409,
      );
    }

    let output: Record<string, unknown> | null = null;

    try {
      switch (action.type) {
        case 'navigate': {
          resultOrThrow(
            await handle.runtime.navigate(action.url, {
              timeoutMs: this.actionTimeoutMs,
            }),
          );
          output = { url: handle.lease.page.url() || action.url };
          break;
        }
        case 'fill': {
          resultOrThrow(
            await handle.runtime.fill(action.selectors, action.value, {
              timeoutMs: this.actionTimeoutMs,
              waitForVisible: true,
            }),
          );
          break;
        }
        case 'select': {
          resultOrThrow(
            await handle.runtime.select(action.selectors, action.value, {
              timeoutMs: this.actionTimeoutMs,
            }),
          );
          break;
        }
        case 'click': {
          resultOrThrow(
            await handle.runtime.click(action.selectors, {
              timeoutMs: this.actionTimeoutMs,
            }),
          );
          break;
        }
        case 'wait': {
          if (action.condition === 'timeout') {
            const timeoutMs =
              typeof action.value === 'number' && Number.isFinite(action.value)
                ? action.value
                : this.actionTimeoutMs;
            await new Promise((resolve) => setTimeout(resolve, timeoutMs));
          } else if (action.condition === 'networkidle') {
            resultOrThrow(await handle.runtime.waitForNetworkIdle(this.actionTimeoutMs));
          } else {
            resultOrThrow(
              await handle.runtime.waitFor(selectorsForWait(action), {
                timeoutMs:
                  typeof action.value === 'number' && Number.isFinite(action.value)
                    ? action.value
                    : this.actionTimeoutMs,
              }),
            );
          }
          break;
        }
        case 'extract': {
          if (action.extractionType === 'text') {
            const extracted = resultOrThrow(await handle.runtime.extractText(action.selectors));
            output = { value: extracted };
          } else if (action.extractionType === 'attribute') {
            if (!action.attributeName) {
              throw new ServerError(
                'attributeName is required for attribute extraction',
                'RECORDER_EXTRACT_ATTRIBUTE_REQUIRED',
                400,
              );
            }
            const extracted = resultOrThrow(
              await handle.runtime.extractAttribute(action.selectors, action.attributeName),
            );
            output = { value: extracted };
          } else if (action.extractionType === 'table') {
            const extracted = resultOrThrow(await handle.runtime.extractTable(action.selectors));
            output = extracted as unknown as Record<string, unknown>;
          } else {
            const list = resultOrThrow(
              await handle.runtime.extractList(action.selectors, {
                itemSelector: action.listItemSelector ?? ':scope > *',
                mode: action.listItemMode ?? 'text',
                ...(action.listItemAttributeName
                  ? { attributeName: action.listItemAttributeName }
                  : {}),
              }),
            );
            output = { items: list };
          }
          break;
        }
      }

      const savedAction = await this.actionRepository.append({
        sessionId,
        action,
        output,
      });

      const latestDiscovery = await this.captureLastDiscovery(current, handle);
      this.touch(sessionId);

      return {
        action: savedAction,
        ...(latestDiscovery ? { lastDiscovery: latestDiscovery } : {}),
      };
    } catch (error) {
      const normalized = normalizeError(error);
      const savedAction = await this.actionRepository.append({
        sessionId,
        action,
        error: normalized,
      });

      await this.sessionRepository.update({
        id: sessionId,
        error: normalized,
      });

      throw new ServerError('Recorder action failed', 'RECORDER_ACTION_FAILED', 400, {
        sessionId,
        actionType: action.type,
        actionId: savedAction.id,
        ...normalized,
      });
    }
  }

  async listActions(input: {
    sessionId: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: RecorderActionRecord[]; nextCursor?: string }> {
    return this.actionRepository.list({
      sessionId: input.sessionId,
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
      ascending: true,
    });
  }

  async finalizeSession(input: {
    sessionId: string;
    register?: boolean;
    name?: string;
  }): Promise<RecorderSessionFinalizeResponse | null> {
    const session = await this.sessionRepository.getById(input.sessionId);
    if (!session) {
      return null;
    }

    const actions = await this.actionRepository.listAllForSession(input.sessionId);
    const workflowName = input.name ?? session.session.name ?? null;
    const finalized = this.recorderService.finalize({
      session: session.session,
      actions,
      ...(workflowName ? { workflowName } : {}),
    });

    if (!finalized.ok) {
      throw new ServerError(
        finalized.error.message,
        finalized.error.code,
        finalized.error.statusCode,
        {
          ...(finalized.error.details ?? {}),
          sessionId: input.sessionId,
        },
      );
    }

    let registeredWorkflowId: string | undefined;
    if (input.register) {
      const registered = await this.workflowRepository.register({
        workflow: finalized.data.workflow,
        name: input.name ?? finalized.data.workflow.name,
      });
      registeredWorkflowId = registered.id;
    }

    await this.sessionRepository.update({
      id: input.sessionId,
      status: 'finalized',
      draftWorkflow: finalized.data.workflow,
      finishedAt: new Date().toISOString(),
      error: null,
    });

    await this.releaseRuntime(input.sessionId, 'ok');

    return {
      workflow: finalized.data.workflow,
      issues: finalized.data.issues,
      warnings: finalized.data.warnings,
      ...(registeredWorkflowId ? { registeredWorkflowId } : {}),
    };
  }

  async stopSession(sessionId: string): Promise<RecorderSessionRecord | null> {
    const session = await this.sessionRepository.getById(sessionId);
    if (!session) {
      return null;
    }

    if (session.session.status !== 'active') {
      return session.session;
    }

    const updated = await this.sessionRepository.update({
      id: sessionId,
      status: 'stopped',
      finishedAt: new Date().toISOString(),
    });

    await this.releaseRuntime(sessionId, 'ok');
    return updated?.session ?? null;
  }

  async cleanupIdleSessions(): Promise<number> {
    const now = Date.now();
    let stopped = 0;

    for (const [sessionId, handle] of this.activeSessions.entries()) {
      if (now - handle.touchedAt > this.idleSessionTtlMs) {
        const updated = await this.sessionRepository.update({
          id: sessionId,
          status: 'stopped',
          finishedAt: new Date().toISOString(),
        });
        if (updated) {
          stopped += 1;
        }
        await this.releaseRuntime(sessionId, 'ok');
      }
    }

    return stopped;
  }

  async stopAll(): Promise<void> {
    const sessionIds = [...this.activeSessions.keys()];
    await Promise.all(
      sessionIds.map(async (sessionId) => {
        await this.sessionRepository.update({
          id: sessionId,
          status: 'stopped',
          finishedAt: new Date().toISOString(),
        });
        await this.releaseRuntime(sessionId, 'ok');
      }),
    );
  }

  private async requireActiveSession(sessionId: string): Promise<RecordingSessionDetails | null> {
    const session = await this.sessionRepository.getById(sessionId);
    if (!session) {
      return null;
    }

    if (session.session.status !== 'active') {
      throw new ServerError('Recorder session is not active', 'RECORDER_SESSION_NOT_ACTIVE', 409, {
        sessionId,
        status: session.session.status,
      });
    }

    return session;
  }

  private touch(sessionId: string): void {
    const active = this.activeSessions.get(sessionId);
    if (!active) {
      return;
    }
    active.touchedAt = Date.now();
  }

  private async captureLastDiscovery(
    session: RecordingSessionDetails,
    handle: ActiveRecorderSession,
  ): Promise<import('@fireapi/browser').DiscoveryResult | null> {
    const url = handle.lease.page.url() || session.session.currentUrl || session.session.startUrl;
    const discovered = await this.pageDiscovery.discoverFromPage(handle.lease.page, {
      url,
      timeoutMs: this.actionTimeoutMs,
      includeTables: true,
      includePagination: true,
      detectDependencies: true,
    });

    if (!discovered.ok) {
      this.logger.warn(
        {
          recorderSessionId: session.session.id,
          cause: discovered.error.message,
        },
        'Recorder action post-discovery failed',
      );
      await this.sessionRepository.update({
        id: session.session.id,
        currentUrl: url,
      });
      return null;
    }

    await this.sessionRepository.update({
      id: session.session.id,
      currentUrl: url,
      lastDiscovery: discovered.data,
      error: null,
    });

    return discovered.data;
  }

  private async releaseRuntime(sessionId: string, outcome: 'ok' | 'error'): Promise<void> {
    const active = this.activeSessions.get(sessionId);
    if (!active) {
      return;
    }

    this.activeSessions.delete(sessionId);

    try {
      await active.runtime.close();
    } catch (error) {
      this.logger.warn(
        {
          recorderSessionId: sessionId,
          cause: error instanceof Error ? error.message : String(error),
        },
        'Failed to close recorder runtime',
      );
    }

    if (this.sessionManager) {
      await this.sessionManager.release(active.lease, outcome);
    }
  }
}

export async function collectDashboardOverview(input: {
  workflowRepository: WorkflowRepository;
  runRepository: import('../db/repositories/run-repository.js').RunRepository;
  recordingSessionRepository: RecordingSessionRepository;
}): Promise<{
  workflowsTotal: number;
  runsByStatus: Record<'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled', number>;
  activeRecorderSessions: number;
  recentRuns: Array<{
    runId: string;
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
    createdAt: string;
    workflowId: string | null;
  }>;
}> {
  const [
    workflowsTotal,
    queued,
    running,
    succeeded,
    failed,
    cancelled,
    activeRecorderSessions,
    recentRuns,
  ] = await Promise.all([
    input.workflowRepository.count(),
    input.runRepository.countByStatus('queued'),
    input.runRepository.countByStatus('running'),
    input.runRepository.countByStatus('succeeded'),
    input.runRepository.countByStatus('failed'),
    input.runRepository.countByStatus('cancelled'),
    input.recordingSessionRepository.countByStatus('active'),
    input.runRepository.listRecent(10),
  ]);

  return {
    workflowsTotal,
    runsByStatus: {
      queued,
      running,
      succeeded,
      failed,
      cancelled,
    },
    activeRecorderSessions,
    recentRuns: recentRuns.map((run) => ({
      runId: run.id,
      status: run.status,
      createdAt: run.createdAt,
      workflowId: run.workflowId,
    })),
  };
}

export function normalizeFinalizeIssues(
  issues: WorkflowValidationIssue[],
): Array<{ severity: string; code: string; message: string; path?: string }> {
  return issues.map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    ...(issue.path ? { path: issue.path } : {}),
  }));
}
