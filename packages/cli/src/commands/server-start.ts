import type { Command } from 'commander';

import { createFireAPIServer } from '@fireapi/server';

import { printJson, printLine } from '../io.js';

interface StartOptions {
  host?: string;
  port?: number;
  db?: string;
  firecrawlKey?: string;
  runnerConcurrency?: number;
}

export function registerServerStartCommand(program: Command): void {
  const server = program.command('server').description('Server lifecycle commands');

  server
    .command('start')
    .description('Start FireAPI server')
    .option('--host <host>', 'Server host', '127.0.0.1')
    .option('--port <port>', 'Server port', (value) => Number(value), 3001)
    .option('--db <databaseUrl>', 'SQLite URL', 'file:./fireapi.db')
    .option('--firecrawl-key <key>', 'Firecrawl API key')
    .option('--runner-concurrency <n>', 'Concurrent run workers', (value) => Number(value), 1)
    .action(async function runStart(this: Command, options: StartOptions) {
      const globals = this.optsWithGlobals<{ json?: boolean }>();
      const serverInstance = await createFireAPIServer({
        databaseUrl: options.db ?? 'file:./fireapi.db',
        ...(options.host ? { host: options.host } : {}),
        ...(options.port !== undefined ? { port: options.port } : {}),
        ...(options.firecrawlKey ? { firecrawlApiKey: options.firecrawlKey } : {}),
        ...(options.runnerConcurrency !== undefined
          ? { runnerConcurrency: options.runnerConcurrency }
          : {}),
      });

      await serverInstance.start();

      const payload = {
        ok: true,
        host: options.host ?? '127.0.0.1',
        port: options.port ?? 3001,
        databaseUrl: options.db ?? 'file:./fireapi.db',
      };

      if (globals.json) {
        printJson(payload);
      } else {
        printLine(`FireAPI server started on http://${payload.host}:${payload.port}`);
      }

      await new Promise<void>((resolve, reject) => {
        const shutdown = async () => {
          try {
            await serverInstance.stop();
            resolve();
          } catch (error) {
            reject(error);
          }
        };

        process.once('SIGINT', () => {
          void shutdown();
        });
        process.once('SIGTERM', () => {
          void shutdown();
        });
      });
    });
}
