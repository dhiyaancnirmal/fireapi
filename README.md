# FireAPI (Milestones 1-4)

This repository now includes:

- `@fireapi/browser` (Milestone 1)
- `@fireapi/core` (Milestones 2 + 3)
- `@fireapi/server` + `@fireapi/cli` (Milestone 4)

## Workspace Commands

```bash
pnpm install
pnpm turbo build
pnpm turbo typecheck
pnpm turbo lint
pnpm turbo test -- --run
```

## Server Quickstart

```bash
pnpm --filter @fireapi/cli exec fireapi server start --db file:./fireapi.db --port 3001
```

OpenAPI JSON is served at `http://127.0.0.1:3001/v1/openapi.json`.

## CLI Quickstart

```bash
pnpm --filter @fireapi/cli build
pnpm --filter @fireapi/cli exec fireapi discover --url https://example.com --out discovery.json
pnpm --filter @fireapi/cli exec fireapi workflow generate --discovery discovery.json --out workflow.json
pnpm --filter @fireapi/cli exec fireapi workflow validate --workflow workflow.json
```

## Live Firecrawl Integration Tests

Set `FIRECRAWL_API_KEY` to enable env-gated live tests in browser/core packages.
# fireapi
