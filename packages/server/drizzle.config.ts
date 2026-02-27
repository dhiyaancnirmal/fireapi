import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.FIREAPI_DATABASE_URL ?? 'file:./fireapi.db',
  },
  strict: true,
  verbose: true,
});
