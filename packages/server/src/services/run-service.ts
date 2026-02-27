import {
  BrowserWorkflowRuntime,
  type WorkflowExecutionError,
  WorkflowExecutor,
  type WorkflowGraph,
  type WorkflowRuntime,
} from '@fireapi/core';
import type { Logger } from 'pino';

import type { RunEventRepository } from '../db/repositories/run-event-repository.js';
import type {
  CreateRunInput,
  ListRunsInput,
  ListRunsOutput,
  RunRepository,
} from '../db/repositories/run-repository.js';
import { RunWorker } from '../queue/run-worker.js';
import type { RunRecord } from '../types.js';

function asErrorRecord(error: unknown): Record<string, unknown> {
  if (error && typeof error === 'object') {
    const value = error as { code?: unknown; message?: unknown; details?: unknown };
    const code = typeof value.code === 'string' ? value.code : 'RUN_FAILED';
    const message = typeof value.message === 'string' ? value.message : String(error);
    const details =
      value.details && typeof value.details === 'object'
        ? (value.details as Record<string, unknown>)
        : undefined;
    return {
      code,
      message,
      ...(details ? { details } : {}),
    };
  }

  if (error instanceof Error) {
    return {
      code: 'RUN_FAILED',
      message: error.message,
    };
  }

  return {
    code: 'RUN_FAILED',
    message: String(error),
  };
}

function isCancellationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes('RUN_CANCELLED');
}

function traceToRecords(trace: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(trace)) {
    return null;
  }
  return trace.filter(
    (value): value is Record<string, unknown> =>
      !!value && typeof value === 'object' && !Array.isArray(value),
  );
}

class CancellationAwareRuntime implements WorkflowRuntime {
  constructor(
    private readonly inner: WorkflowRuntime,
    private readonly cancellationRequested: () => Promise<boolean>,
  ) {}

  private async guard<T>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: Error }>) {
    if (await this.cancellationRequested()) {
      return { ok: false as const, error: new Error('RUN_CANCELLED') };
    }

    const result = await fn();
    if (!result.ok && (await this.cancellationRequested())) {
      return { ok: false as const, error: new Error('RUN_CANCELLED') };
    }

    return result;
  }

  navigate(url: string, options?: { timeoutMs?: number }) {
    return this.guard(() => this.inner.navigate(url, options));
  }

  fill(
    selectors: import('@fireapi/browser').SelectorStrategy[],
    value: string,
    options?: import('@fireapi/browser').InteractionOptions,
  ) {
    return this.guard(() => this.inner.fill(selectors, value, options));
  }

  select(
    selectors: import('@fireapi/browser').SelectorStrategy[],
    value: string,
    options?: import('@fireapi/browser').InteractionOptions,
  ) {
    return this.guard(() => this.inner.select(selectors, value, options));
  }

  click(
    selectors: import('@fireapi/browser').SelectorStrategy[],
    options?: import('@fireapi/browser').InteractionOptions,
  ) {
    return this.guard(() => this.inner.click(selectors, options));
  }

  waitFor(
    selectors: import('@fireapi/browser').SelectorStrategy[],
    options?: import('@fireapi/browser').InteractionOptions,
  ) {
    return this.guard(() => this.inner.waitFor(selectors, options));
  }

  extractText(selectors: import('@fireapi/browser').SelectorStrategy[]) {
    return this.guard(() => this.inner.extractText(selectors));
  }

  extractAttribute(selectors: import('@fireapi/browser').SelectorStrategy[], attribute: string) {
    return this.guard(() => this.inner.extractAttribute(selectors, attribute));
  }

  extractTable(
    selectors: import('@fireapi/browser').SelectorStrategy[],
    options?: { sampleRows?: number },
  ) {
    return this.guard(() => this.inner.extractTable(selectors, options));
  }

  extractList(
    selectors: import('@fireapi/browser').SelectorStrategy[],
    options: { itemSelector: string; mode: 'text' | 'attribute'; attributeName?: string },
  ) {
    return this.guard(() => this.inner.extractList(selectors, options));
  }

  close(): Promise<void> {
    return this.inner.close ? this.inner.close() : Promise.resolve();
  }
}

export interface RunServiceOptions {
  runRepository: RunRepository;
  runEventRepository: RunEventRepository;
  runtimeFactory: (run: RunRecord) => Promise<WorkflowRuntime>;
  logger: Logger;
  pollIntervalMs: number;
  runnerConcurrency: number;
}

export class RunService {
  private readonly executor: WorkflowExecutor;
  private readonly workers: RunWorker[] = [];
  private started = false;

  constructor(private readonly options: RunServiceOptions) {
    this.executor = new WorkflowExecutor();
  }

  async enqueue(input: CreateRunInput): Promise<RunRecord> {
    const run = await this.options.runRepository.createQueued(input);
    await this.options.runEventRepository.append(run.id, 'queued', {
      status: run.status,
      workflowId: run.workflowId,
    });
    return run;
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    return this.options.runRepository.getById(runId);
  }

  async listRuns(input: ListRunsInput): Promise<ListRunsOutput> {
    return this.options.runRepository.list(input);
  }

  async cancelRun(runId: string): Promise<RunRecord | null> {
    const run = await this.options.runRepository.getById(runId);
    if (!run) {
      return null;
    }

    if (run.status === 'queued') {
      await this.options.runEventRepository.append(runId, 'cancel_requested', {
        previousStatus: run.status,
      });
      await this.options.runRepository.markCancelled(runId);
      await this.options.runEventRepository.append(runId, 'cancelled', {
        previousStatus: run.status,
      });
      return this.options.runRepository.getById(runId);
    }

    if (run.status === 'running') {
      await this.options.runEventRepository.append(runId, 'cancel_requested', {
        previousStatus: run.status,
      });
      return run;
    }

    return run;
  }

  startWorkers(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    const concurrency = Math.max(1, this.options.runnerConcurrency);
    for (let index = 0; index < concurrency; index += 1) {
      const worker = new RunWorker({
        workerId: index + 1,
        pollIntervalMs: this.options.pollIntervalMs,
        logger: this.options.logger,
        claim: async () => this.options.runRepository.claimNextQueued(),
        execute: async (run) => this.executeClaimedRun(run),
      });
      worker.start();
      this.workers.push(worker);
    }
  }

  async stopWorkers(): Promise<void> {
    this.started = false;
    const current = [...this.workers];
    this.workers.length = 0;
    await Promise.all(current.map((worker) => worker.stop()));
  }

  async runOnce(): Promise<boolean> {
    const run = await this.options.runRepository.claimNextQueued();
    if (!run) {
      return false;
    }
    await this.executeClaimedRun(run);
    return true;
  }

  private async executeClaimedRun(run: RunRecord): Promise<void> {
    await this.options.runEventRepository.append(run.id, 'running', {
      workflowId: run.workflowId,
      startedAt: new Date().toISOString(),
    });

    let runtime: WorkflowRuntime | null = null;

    try {
      runtime = await this.options.runtimeFactory(run);
      const wrappedRuntime = new CancellationAwareRuntime(runtime, async () =>
        this.options.runEventRepository.isCancellationRequested(run.id),
      );

      const result = await this.executor.execute(run.workflowSnapshot, run.input, wrappedRuntime);

      const cancelled = await this.options.runEventRepository.isCancellationRequested(run.id);
      if (cancelled) {
        await this.options.runRepository.markCancelled(run.id);
        await this.options.runEventRepository.append(run.id, 'cancelled', {
          reason: 'Cancellation requested while running',
        });
        return;
      }

      if (result.ok) {
        const trace = traceToRecords(result.data.context.trace);
        if (trace) {
          for (const event of trace) {
            await this.options.runEventRepository.append(run.id, 'trace', event);
          }
        }

        await this.options.runRepository.markSucceeded(
          run.id,
          result.data as unknown as Record<string, unknown>,
          trace,
        );
        await this.options.runEventRepository.append(run.id, 'succeeded', {
          durationMs: result.data.durationMs,
          extractedTargets: Object.keys(result.data.data),
        });
        return;
      }

      if (isCancellationError(result.error)) {
        await this.options.runRepository.markCancelled(run.id);
        await this.options.runEventRepository.append(run.id, 'cancelled', {
          reason: result.error.message,
        });
        return;
      }

      await this.handleExecutionFailure(run.id, result.error);
    } catch (error) {
      await this.handleExecutionFailure(run.id, error);
    } finally {
      if (runtime?.close) {
        await runtime.close();
      }
    }
  }

  private async handleExecutionFailure(
    runId: string,
    error: WorkflowExecutionError | Error | unknown,
  ): Promise<void> {
    const record = asErrorRecord(error);
    await this.options.runRepository.markFailed(runId, record, null);
    await this.options.runEventRepository.append(runId, 'failed', record);
  }
}

export function createBrowserRuntimeFactory(
  runtimeOptions: Omit<ConstructorParameters<typeof BrowserWorkflowRuntime>[0], 'logger'>,
): (run: RunRecord) => Promise<WorkflowRuntime> {
  return async () => {
    const runtime = new BrowserWorkflowRuntime(runtimeOptions);
    const initialized = await runtime.init();
    if (!initialized.ok) {
      throw initialized.error;
    }
    return runtime;
  };
}
