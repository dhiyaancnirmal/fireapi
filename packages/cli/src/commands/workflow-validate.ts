import type { WorkflowGraph } from '@fireapi/core';
import type { Command } from 'commander';

import { FireAPIClient } from '../http-client.js';
import { printJson, printLine, readJsonFile } from '../io.js';

interface ValidateOptions {
  workflow: string;
}

export function registerWorkflowValidateCommand(workflowCommand: Command): void {
  workflowCommand
    .command('validate')
    .description('Validate a workflow JSON document')
    .requiredOption('--workflow <file>', 'Workflow JSON file')
    .action(async function runValidate(this: Command, options: ValidateOptions) {
      const globals = this.optsWithGlobals<{ serverUrl?: string; json?: boolean }>();
      const client = new FireAPIClient({ baseUrl: globals.serverUrl ?? 'http://127.0.0.1:3001' });
      const workflow = await readJsonFile<WorkflowGraph>(options.workflow);
      const response = await client.validateWorkflow(workflow);

      if (globals.json) {
        printJson(response);
      } else if (response.valid) {
        printLine('Workflow is valid');
      } else {
        printLine(`Workflow is invalid (${response.issues.length} issues)`);
        for (const issue of response.issues) {
          printLine(`- [${issue.code}] ${issue.message}`);
        }
      }

      if (!response.valid) {
        process.exitCode = 2;
      }
    });
}
