import { type Command, CommanderError } from 'commander';

import { FireAPIClient } from '../http-client.js';
import { printJson, printLine } from '../io.js';

interface RecorderStartOptions {
  url?: string;
  name?: string;
}

export function registerRecorderStartCommand(program: Command): void {
  const recorder = program.command('recorder').description('Recorder operations');

  recorder
    .command('start')
    .description('Start a guided recorder session')
    .requiredOption('--url <url>', 'Start URL')
    .option('--name <name>', 'Session name')
    .action(async function recorderStart(this: Command, options: RecorderStartOptions) {
      const globals = this.optsWithGlobals<{ serverUrl?: string; json?: boolean }>();
      if (!options.url) {
        throw new CommanderError(2, 'recorder.start.url_required', '--url is required');
      }

      const client = new FireAPIClient({ baseUrl: globals.serverUrl ?? 'http://127.0.0.1:3001' });
      const created = await client.createRecorderSession({
        url: options.url,
        ...(options.name ? { name: options.name } : {}),
      });

      if (globals.json) {
        printJson(created);
      } else {
        printLine(`Recorder session started: ${created.session.id}`);
        printLine(`Live View: ${created.session.liveViewUrl}`);
      }
    });
}
