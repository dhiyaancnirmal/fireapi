import { exec } from 'node:child_process';
import os from 'node:os';

import type { Command } from 'commander';

import { FireAPIClient } from '../http-client.js';
import { printJson, printLine } from '../io.js';

interface DashboardOpenOptions {
  serverUrl?: string;
  open?: boolean;
}

function openInBrowser(url: string): Promise<void> {
  const platform = os.platform();
  const command =
    platform === 'darwin'
      ? `open "${url}"`
      : platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;

  return new Promise((resolve, reject) => {
    exec(command, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function registerDashboardOpenCommand(program: Command): void {
  const dashboard = program.command('dashboard').description('Dashboard helpers');

  dashboard
    .command('open')
    .description('Print (and optionally open) dashboard URL')
    .option('--server-url <url>', 'Override server URL')
    .option('--open', 'Open in default browser')
    .action(async function dashboardOpen(this: Command, options: DashboardOpenOptions) {
      const globals = this.optsWithGlobals<{ serverUrl?: string; json?: boolean }>();
      const baseUrl = (options.serverUrl ?? globals.serverUrl ?? 'http://127.0.0.1:3001').replace(
        /\/$/,
        '',
      );
      const client = new FireAPIClient({ baseUrl });
      await client.health();

      const dashboardUrl = `${baseUrl}/dashboard`;
      if (options.open) {
        await openInBrowser(dashboardUrl);
      }

      if (globals.json) {
        printJson({ dashboardUrl, opened: Boolean(options.open) });
      } else {
        printLine(dashboardUrl);
      }
    });
}
