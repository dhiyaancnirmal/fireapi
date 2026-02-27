import type { Logger } from 'pino';

import type { RunRecord } from '../types.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RunWorkerDeps {
  workerId: number;
  pollIntervalMs: number;
  logger: Logger;
  claim: () => Promise<RunRecord | null>;
  execute: (run: RunRecord) => Promise<void>;
}

export class RunWorker {
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(private readonly deps: RunWorkerDeps) {}

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.loopPromise) {
      await this.loopPromise;
      this.loopPromise = null;
    }
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const run = await this.deps.claim();
        if (!run) {
          await sleep(this.deps.pollIntervalMs);
          continue;
        }

        await this.deps.execute(run);
      } catch (error) {
        this.deps.logger.error(
          {
            workerId: this.deps.workerId,
            err: error instanceof Error ? error.message : String(error),
          },
          'Run worker loop error',
        );
        await sleep(this.deps.pollIntervalMs);
      }
    }
  }
}
