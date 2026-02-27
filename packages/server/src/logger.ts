import pino, { type Logger, type LoggerOptions } from 'pino';

export function createServerLogger(base?: Record<string, unknown>): Logger {
  const options: LoggerOptions = {
    level: process.env.LOG_LEVEL ?? 'info',
    base: {
      component: '@fireapi/server',
      ...(base ?? {}),
    },
    redact: ['*.apiKey', '*.authorization', '*.cookie', '*.password'],
  };

  return pino(options);
}
