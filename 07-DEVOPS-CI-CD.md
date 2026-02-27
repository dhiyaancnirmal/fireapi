# 07 — DevOps, CI/CD, Environments & Configuration

## CI/CD: GitHub Actions

### CI Pipeline (Every PR)

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo typecheck

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo test -- --run --reporter=verbose
      - uses: codecov/codecov-action@v4
        with:
          files: packages/*/coverage/lcov.info

  test-integration:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    env:
      FIRECRAWL_API_KEY: ${{ secrets.FIRECRAWL_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
      - run: pnpm turbo test:integration

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
      
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm audit --audit-level=high
```

### Release Pipeline

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
      - run: pnpm turbo test -- --run
      - run: pnpm -r publish --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
```

---

## Environments

This is a self-hosted open-source tool, not a SaaS, so environments are simpler:

| Environment | Purpose | Firecrawl Key | Database |
|---|---|---|---|
| **Development** | Local dev with `pnpm dev` | Personal free tier key | `./dev.db` |
| **Test (CI)** | GitHub Actions | `secrets.FIRECRAWL_API_KEY` | In-memory / temp file |
| **Production** | User's deployment | User's own key | `~/.fireapi/fireapi.db` |

---

## Configuration

### Environment Variables

```bash
# .env.example

# Required
FIRECRAWL_API_KEY=fc-YOUR-API-KEY         # Get from https://firecrawl.dev/app/api-keys

# Server
PORT=3000                                  # API server port
HOST=0.0.0.0                               # Bind address

# Database
FIREAPI_DB_PATH=~/.fireapi/fireapi.db      # SQLite database path

# Logging
LOG_LEVEL=info                             # trace | debug | info | warn | error | fatal
NODE_ENV=production                        # development | production | test

# Session Management
FIREAPI_MAX_CONCURRENT_SESSIONS=5          # Max parallel Firecrawl sessions
FIREAPI_SESSION_TTL=120                    # Default session TTL in seconds
FIREAPI_SESSION_POOL_SIZE=3                # Warm session pool size

# Cache
FIREAPI_CACHE_ENABLED=true                 # Enable/disable response caching
FIREAPI_CACHE_DEFAULT_TTL=300              # Default cache TTL in seconds
FIREAPI_CACHE_MAX_ENTRIES=1000             # Max cached responses

# Self-Healing
FIREAPI_HEALTH_CHECK_INTERVAL=3600         # Health check interval in seconds (0 = disabled)
FIREAPI_AUTO_HEAL=true                     # Enable automatic selector healing

# Security (optional)
FIREAPI_API_KEY=                           # Simple bearer token auth (empty = no auth)

# Dashboard
FIREAPI_DASHBOARD_ENABLED=true             # Serve dashboard UI
```

### Configuration File

Optional `fireapi.config.ts` for project-level configuration:

```typescript
// fireapi.config.ts
import { defineConfig } from '@fireapi/cli';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    cors: {
      origin: '*',
    },
  },
  firecrawl: {
    apiKey: process.env.FIRECRAWL_API_KEY,
    maxConcurrentSessions: 5,
    sessionTtl: 120,
  },
  cache: {
    enabled: true,
    defaultTtl: 300,
    maxEntries: 1000,
  },
  healing: {
    enabled: true,
    checkInterval: 3600,
  },
  database: {
    path: './fireapi.db',
  },
});
```

### Configuration Resolution Order

1. CLI flags (highest priority)
2. Environment variables
3. `fireapi.config.ts` in current directory
4. Default values (lowest priority)

---

## Docker Support

```dockerfile
# Dockerfile
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS builder
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/ packages/
RUN pnpm install --frozen-lockfile
RUN pnpm turbo build

FROM base AS runner
WORKDIR /app
RUN addgroup --system fireapi && adduser --system --ingroup fireapi fireapi
COPY --from=builder --chown=fireapi:fireapi /app/node_modules /app/node_modules
COPY --from=builder --chown=fireapi:fireapi /app/packages/*/dist /app/packages/
COPY --from=builder --chown=fireapi:fireapi /app/package.json /app/

USER fireapi
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "packages/cli/dist/index.js", "serve"]
```

```yaml
# docker-compose.yml
services:
  fireapi:
    build: .
    ports:
      - "3000:3000"
    environment:
      - FIRECRAWL_API_KEY=${FIRECRAWL_API_KEY}
      - FIREAPI_DB_PATH=/data/fireapi.db
    volumes:
      - fireapi-data:/data
      - ./workflows:/app/workflows

volumes:
  fireapi-data:
```

---

## Git Hooks (via Biome + Lefthook or simple scripts)

```jsonc
// package.json (root)
{
  "scripts": {
    "precommit": "pnpm turbo lint && pnpm turbo typecheck"
  }
}
```

Or with [lefthook](https://github.com/evilmartians/lefthook):

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    lint:
      run: pnpm biome check --staged
    typecheck:
      run: pnpm turbo typecheck
```
