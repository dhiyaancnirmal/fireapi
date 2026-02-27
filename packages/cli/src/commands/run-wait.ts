import type { Command } from 'commander';

import { FireAPIClient, type RunStatusResponse } from '../http-client.js';
import { printJson, printLine } from '../io.js';

interface RunWaitOptions {
  runId: string;
  intervalMs?: number;
  timeoutMs?: number;
}

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

async function waitForRun(
  client: FireAPIClient,
  runId: string,
  intervalMs: number,
  timeoutMs: number,
): Promise<RunStatusResponse> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const run = await client.getRun(runId);
    if (TERMINAL.has(run.status)) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for run ${runId}`);
}

export function registerRunWaitCommand(runCommand: Command): void {
  runCommand
    .command('wait')
    .description('Wait until a run reaches terminal status')
    .requiredOption('--run-id <id>', 'Run ID')
    .option('--interval-ms <ms>', 'Polling interval', (value) => Number(value), 500)
    .option('--timeout-ms <ms>', 'Timeout', (value) => Number(value), 5 * 60 * 1000)
    .action(async function runWait(this: Command, options: RunWaitOptions) {
      const globals = this.optsWithGlobals<{ serverUrl?: string; json?: boolean }>();
      const client = new FireAPIClient({ baseUrl: globals.serverUrl ?? 'http://127.0.0.1:3001' });

      const finalRun = await waitForRun(
        client,
        options.runId,
        options.intervalMs ?? 500,
        options.timeoutMs ?? 5 * 60 * 1000,
      );

      if (globals.json) {
        printJson(finalRun);
      } else {
        printLine(`Run ${options.runId} finished with ${finalRun.status}`);
      }

      if (finalRun.status !== 'succeeded') {
        process.exitCode = 1;
      }
    });
}
