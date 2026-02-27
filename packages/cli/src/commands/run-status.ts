import type { Command } from 'commander';

import { FireAPIClient } from '../http-client.js';
import { printJson, printLine } from '../io.js';

interface RunStatusOptions {
  runId: string;
}

export function registerRunStatusCommand(runCommand: Command): void {
  runCommand
    .command('status')
    .description('Fetch run status by id')
    .requiredOption('--run-id <id>', 'Run ID')
    .action(async function runStatus(this: Command, options: RunStatusOptions) {
      const globals = this.optsWithGlobals<{ serverUrl?: string; json?: boolean }>();
      const client = new FireAPIClient({ baseUrl: globals.serverUrl ?? 'http://127.0.0.1:3001' });

      const status = await client.getRun(options.runId);
      if (globals.json) {
        printJson(status);
        return;
      }

      printLine(`Run ${status.runId}: ${status.status}`);
      if (status.finishedAt) {
        printLine(`Finished: ${status.finishedAt}`);
      }
    });
}
