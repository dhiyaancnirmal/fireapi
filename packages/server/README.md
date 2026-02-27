# @fireapi/server

Fastify + SQLite server for FireAPI workflow discovery/generation/execution.

## Features

- REST API under `/v1`
- OpenAPI 3.1 JSON at `/v1/openapi.json`
- Async run queue with persisted run/runevent records
- Recorder API under `/v1/recorder/*`
- Dashboard overview API at `/v1/dashboard/overview`
- Static dashboard hosting at `/dashboard` (serves `packages/dashboard/dist`)
- SQLite-first persistence via Drizzle + better-sqlite3
- Pluggable auth provider (defaults to no-op)

## Programmatic Usage

```ts
import { createFireAPIServer } from '@fireapi/server';

const server = await createFireAPIServer({
  databaseUrl: 'file:./fireapi.db',
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
});

await server.start();
```

## Environment

- `FIRECRAWL_API_KEY`
- `FIREAPI_DATABASE_URL` (used by migration script; default `file:./fireapi.db`)
- `FIREAPI_MAX_CONCURRENT_SESSIONS`
- `FIREAPI_SESSION_POOL_SIZE`
- `FIREAPI_SESSION_TTL`
- `FIREAPI_ACTIVITY_TTL`
- `FIREAPI_MAX_USES_PER_SESSION`
- `FIREAPI_ACQUIRE_TIMEOUT_MS`
- `FIREAPI_SESSION_QUEUE_SIZE`
- `FIREAPI_RECORDER_MAX_ACTIVE_SESSIONS`
- `FIREAPI_RECORDER_ACTION_TIMEOUT_MS`
- `FIREAPI_RECORDER_IDLE_SESSION_TTL_MS`
- `FIREAPI_DASHBOARD_ENABLED`
- `FIREAPI_DASHBOARD_BASE_PATH`
- `FIREAPI_DASHBOARD_ASSETS_PATH`

## DB Commands

```bash
pnpm --filter @fireapi/server db:migrate
```

## Tests

```bash
pnpm --filter @fireapi/server test -- --run
```
