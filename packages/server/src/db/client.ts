import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema.js';

export interface DatabaseClient {
  sqlite: Database.Database;
  db: ReturnType<typeof drizzle<typeof schema>>;
  close(): void;
}

export function resolveDatabasePath(databaseUrl: string): string {
  if (databaseUrl.startsWith('file:')) {
    const value = databaseUrl.slice('file:'.length);
    if (!value || value === ':memory:') {
      return value || ':memory:';
    }
    if (path.isAbsolute(value)) {
      return value;
    }
    return path.resolve(process.cwd(), value);
  }

  if (databaseUrl === ':memory:') {
    return databaseUrl;
  }

  return path.isAbsolute(databaseUrl) ? databaseUrl : path.resolve(process.cwd(), databaseUrl);
}

export function createDatabaseClient(databaseUrl: string): DatabaseClient {
  const filePath = resolveDatabasePath(databaseUrl);
  const sqlite = new Database(filePath);

  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });

  return {
    sqlite,
    db,
    close: () => {
      sqlite.close();
    },
  };
}
