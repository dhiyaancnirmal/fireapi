import type { DiscoveryResult } from '@fireapi/browser';
import type { Command } from 'commander';

import { FireAPIClient } from '../http-client.js';
import { printJson, printLine, readJsonFile, writeJsonFile } from '../io.js';

interface GenerateOptions {
  discovery: string;
  out?: string;
}

export function registerWorkflowGenerateCommand(workflowCommand: Command): void {
  workflowCommand
    .command('generate')
    .description('Generate a workflow from discovery JSON')
    .requiredOption('--discovery <file>', 'Discovery JSON file')
    .option('--out <file>', 'Output file for generated workflow JSON')
    .action(async function runGenerate(this: Command, options: GenerateOptions) {
      const globals = this.optsWithGlobals<{ serverUrl?: string; json?: boolean }>();
      const client = new FireAPIClient({ baseUrl: globals.serverUrl ?? 'http://127.0.0.1:3001' });

      const discovery = await readJsonFile<DiscoveryResult>(options.discovery);
      const generated = await client.generateWorkflow({ discovery });

      if (options.out) {
        await writeJsonFile(options.out, generated.workflow);
      }

      if (globals.json) {
        printJson(generated);
        return;
      }

      printLine(
        `Generated workflow ${generated.workflow.id} with ${generated.workflow.steps.length} steps`,
      );
      if (generated.warnings.length > 0) {
        printLine(`Warnings: ${generated.warnings.map((warning) => warning.code).join(', ')}`);
      }
      if (options.out) {
        printLine(`Wrote generated workflow to ${options.out}`);
      }
    });
}
