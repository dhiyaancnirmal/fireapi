import type { Command } from 'commander';

import { FireAPIClient } from '../http-client.js';
import { printJson, printLine, writeJsonFile } from '../io.js';

interface RecorderFinalizeOptions {
  sessionId: string;
  register?: boolean;
  name?: string;
  out?: string;
}

export function registerRecorderFinalizeCommand(program: Command): void {
  const recorder =
    program.commands.find((command) => command.name() === 'recorder') ??
    program.command('recorder').description('Recorder operations');

  recorder
    .command('finalize')
    .description('Finalize a recorder session into a workflow graph')
    .requiredOption('--session-id <id>', 'Recorder session ID')
    .option('--register', 'Register generated workflow in server store')
    .option('--name <name>', 'Override workflow name')
    .option('--out <file>', 'Write finalize payload to file')
    .action(async function recorderFinalize(this: Command, options: RecorderFinalizeOptions) {
      const globals = this.optsWithGlobals<{ serverUrl?: string; json?: boolean }>();
      const client = new FireAPIClient({ baseUrl: globals.serverUrl ?? 'http://127.0.0.1:3001' });

      const finalized = await client.finalizeRecorderSession({
        sessionId: options.sessionId,
        ...(options.register !== undefined ? { register: options.register } : {}),
        ...(options.name ? { name: options.name } : {}),
      });

      if (options.out) {
        await writeJsonFile(options.out, finalized);
      }

      if (globals.json) {
        printJson(finalized);
      } else {
        printLine(`Session ${options.sessionId} finalized`);
        printLine(`Workflow ID: ${finalized.workflow.id}`);
        if (finalized.registeredWorkflowId) {
          printLine(`Registered as: ${finalized.registeredWorkflowId}`);
        }
        if (finalized.warnings.length > 0) {
          printLine(`Warnings: ${finalized.warnings.length}`);
        }
      }

      if (finalized.issues.some((issue) => issue.severity === 'error')) {
        process.exitCode = 1;
      }
    });
}
