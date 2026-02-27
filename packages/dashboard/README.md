# @fireapi/dashboard

React dashboard MVP served by `@fireapi/server` under `/dashboard`.

## Included Views

- `/dashboard` overview
- `/dashboard/workflows`
- `/dashboard/workflows/:id`
- `/dashboard/runs`
- `/dashboard/runs/:id`
- `/dashboard/discover`
- `/dashboard/recorder`
- `/dashboard/recorder/:sessionId`

## Design System

This package consumes the shared Firecrawl design assets from `/design-system`:

- `firecrawl-theme.css`
- `tailwind.firecrawl.preset.ts`
- `firecrawl-brand.tokens.json`

## Commands

```bash
pnpm --filter @fireapi/dashboard dev
pnpm --filter @fireapi/dashboard build
pnpm --filter @fireapi/dashboard test
```
