import type { Command } from 'commander';

import { FireAPIClient } from '../http-client.js';
import { printJson, printLine, writeJsonFile } from '../io.js';

interface DiscoverOptions {
  url: string;
  out?: string;
}

export function registerDiscoverCommand(program: Command): void {
  program
    .command('discover')
    .description('Run page discovery against a URL')
    .requiredOption('--url <url>', 'Target URL')
    .option('--out <file>', 'Write discovery JSON to a file')
    .action(async function runDiscover(this: Command, options: DiscoverOptions) {
      const globals = this.optsWithGlobals<{ serverUrl?: string; json?: boolean }>();
      const client = new FireAPIClient({ baseUrl: globals.serverUrl ?? 'http://127.0.0.1:3001' });
      const response = await client.discover({ url: options.url });

      if (options.out) {
        await writeJsonFile(options.out, response.discovery);
      }

      if (globals.json) {
        printJson(response);
        return;
      }

      printLine(`Discovered ${response.discovery.elements.length} elements at ${options.url}`);
      if (options.out) {
        printLine(`Wrote discovery output to ${options.out}`);
      }
    });
}
