import type { WorkflowGraph } from '@fireapi/core';
import type { Command } from 'commander';

import { CommanderError } from 'commander';
import { FireAPIClient, type RunStatusResponse } from '../http-client.js';
import { parseJsonOrFile, printJson, printLine, readJsonFile } from '../io.js';

interface RunCreateOptions {
  workflow?: string;
  workflowId?: string;
  input: string;
  name?: string;
  wait?: boolean;
}

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

async function waitForTerminalRun(
  client: FireAPIClient,
  runId: string,
  intervalMs: number,
  timeoutMs: number,
): Promise<RunStatusResponse> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const status = await client.getRun(runId);
    if (TERMINAL_STATUSES.has(status.status)) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for run ${runId}`);
}

export function registerRunCreateCommand(runCommand: Command): void {
  runCommand
    .command('create')
    .description('Create an async workflow run')
    .option('--workflow <file>', 'Inline workflow JSON file')
    .option('--workflow-id <id>', 'Registered workflow ID')
    .requiredOption('--input <json-or-file>', 'Run input JSON or file path')
    .option('--name <name>', 'Optional run name')
    .option('--wait', 'Wait for terminal run state')
    .action(async function runCreate(this: Command, options: RunCreateOptions) {
      const globals = this.optsWithGlobals<{ serverUrl?: string; json?: boolean }>();
      const client = new FireAPIClient({ baseUrl: globals.serverUrl ?? 'http://127.0.0.1:3001' });

      if (!options.workflow && !options.workflowId) {
        throw new CommanderError(
          2,
          'run.create.missing_workflow',
          'Provide --workflow or --workflow-id',
        );
      }
      if (options.workflow && options.workflowId) {
        throw new CommanderError(
          2,
          'run.create.conflicting_workflow_flags',
          'Use only one of --workflow or --workflow-id',
        );
      }

      const input = await parseJsonOrFile<Record<string, unknown>>(options.input);
      let workflow: WorkflowGraph | undefined;
      if (options.workflow) {
        workflow = await readJsonFile<WorkflowGraph>(options.workflow);
      }

      const created = await client.createRun({
        ...(options.workflowId ? { workflowId: options.workflowId } : {}),
        ...(workflow ? { workflow } : {}),
        input,
        ...(options.name ? { name: options.name } : {}),
      });

      if (!options.wait) {
        if (globals.json) {
          printJson(created);
        } else {
          printLine(`Run queued: ${created.runId}`);
        }
        return;
      }

      const finalRun = await waitForTerminalRun(client, created.runId, 500, 5 * 60 * 1000);

      if (globals.json) {
        printJson(finalRun);
      } else {
        printLine(`Run ${created.runId} finished with status: ${finalRun.status}`);
      }

      if (finalRun.status !== 'succeeded') {
        process.exitCode = 1;
      }
    });
}
