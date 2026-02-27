import pino, { type LoggerOptions } from 'pino';

export interface CorePackageLogger {
  debug?(bindings: unknown, message?: string): void;
  info?(bindings: unknown, message?: string): void;
  warn?(bindings: unknown, message?: string): void;
  error?(bindings: unknown, message?: string): void;
  child?(bindings: Record<string, unknown>): CorePackageLogger;
}

export interface CreateCoreLoggerOptions {
  level?: string;
  pretty?: boolean;
  base?: Record<string, unknown>;
}

export function createCoreLogger(options: CreateCoreLoggerOptions = {}): CorePackageLogger {
  const loggerOptions: LoggerOptions = {
    level: options.level ?? process.env.LOG_LEVEL ?? 'info',
    base: { component: '@fireapi/core', ...(options.base ?? {}) },
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
