import type { WorkflowGraph } from '@fireapi/core';
import type { Command } from 'commander';

import { FireAPIClient } from '../http-client.js';
import { printJson, printLine, readJsonFile } from '../io.js';

interface RegisterOptions {
  workflow: string;
  name?: string;
}

export function registerWorkflowRegisterCommand(workflowCommand: Command): void {
  workflowCommand
    .command('register')
    .description('Register workflow in server persistence')
    .requiredOption('--workflow <file>', 'Workflow JSON file')
    .option('--name <name>', 'Override workflow display name')
    .action(async function runRegister(this: Command, options: RegisterOptions) {
      const globals = this.optsWithGlobals<{ serverUrl?: string; json?: boolean }>();
      const client = new FireAPIClient({ baseUrl: globals.serverUrl ?? 'http://127.0.0.1:3001' });
      const workflow = await readJsonFile<WorkflowGraph>(options.workflow);
      const response = await client.registerWorkflow({
        workflow,
        ...(options.name ? { name: options.name } : {}),
      });

      if (globals.json) {
        printJson(response);
        return;
      }

      printLine(`Registered workflow ${response.workflowId}`);
      printLine(`Hash: ${response.hash}`);
    });
}
