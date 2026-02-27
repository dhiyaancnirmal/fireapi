# @fireapi/browser

Milestone 1 browser foundation for FireAPI.

## Features (M1)

- Firecrawl Browser Sandbox session lifecycle + basic pooling
- Playwright/CDP page discovery (inputs/selects/buttons/tables/pagination)
- Selector generation/ranking/fallback resolution
- Typed interaction primitives (`fill`, `select`, `click`, `waitFor`, `extractTable`)
- Cascading `<select>` dependency detection (scoped M1 support)

## Install (workspace)

```bash
pnpm install
pnpm --filter @fireapi/browser build
```

## Example

```bash
FIRECRAWL_API_KEY=... pnpm tsx packages/browser/examples/discover.ts https://example.com
```

## Tests

```bash
pnpm --filter @fireapi/browser test
```

`FIRECRAWL_API_KEY` enables conditional live integration tests. Without it, fixture-backed tests still run.

## Known M1 Limitations

- Dependency detection only handles cascading `<select>` option changes
- No workflow/DAG execution layer yet (deferred to `@fireapi/core`)
- No persistence/database integration yet
