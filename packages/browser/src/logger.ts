import pino, { type LoggerOptions } from 'pino';

import type { BrowserPackageLogger } from './types.js';

export interface CreateBrowserLoggerOptions {
  level?: string;
  pretty?: boolean;
  base?: Record<string, unknown>;
}

export function createBrowserLogger(
  options: CreateBrowserLoggerOptions = {},
): BrowserPackageLogger {
  const loggerOptions: LoggerOptions = {
    level: options.level ?? process.env.LOG_LEVEL ?? 'info',
    base: { component: '@fireapi/browser', ...(options.base ?? {}) },
    redact: ['*.apiKey', '*.password', '*.cookie', '*.authorization'],
  };

  if (options.pretty && process.env.NODE_ENV !== 'production') {
    loggerOptions.transport = {
      target: 'pino-pretty',
      options: { colorize: true },
    };
  }

  return pino(loggerOptions);
}
