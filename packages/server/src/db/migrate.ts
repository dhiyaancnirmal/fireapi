import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type Database from 'better-sqlite3';

import { createDatabaseClient } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runMigrations(
  sqlite: Database.Database,
  migrationsDir = path.join(__dirname, 'migrations'),
): void {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    sqlite.exec(sql);
  }
}

function runCliMigration(): void {
  const databaseUrl = process.env.FIREAPI_DATABASE_URL ?? 'file:./fireapi.db';
  const client = createDatabaseClient(databaseUrl);
  try {
    runMigrations(client.sqlite);
    console.log(`Migrations applied to ${databaseUrl}`);
  } finally {
    client.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCliMigration();
}
