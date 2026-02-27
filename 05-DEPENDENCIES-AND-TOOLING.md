# 05 — Dependency Management & Tooling

## Dependency Manifest (as of February 2026)

### Runtime Dependencies

| Package | Version | Purpose | Link |
|---|---|---|---|
| `@mendable/firecrawl-js` | `^4.13.0` | Firecrawl Node SDK (Browser Sandbox, scrape, crawl) | [npm](https://www.npmjs.com/package/@mendable/firecrawl-js) |
| `playwright-core` | `^1.58.2` | Browser automation via CDP (no bundled browsers) | [npm](https://www.npmjs.com/package/playwright-core) |
| `hono` | `^4.12.2` | Ultra-fast TypeScript web framework | [npm](https://www.npmjs.com/package/hono) |
| `@hono/node-server` | `^1.13.x` | Hono adapter for Node.js | [npm](https://www.npmjs.com/package/@hono/node-server) |
| `zod` | `^4.3.6` | TypeScript-first schema validation | [npm](https://www.npmjs.com/package/zod) |
| `drizzle-orm` | `^0.45.1` | Type-safe ORM for SQLite | [npm](https://www.npmjs.com/package/drizzle-orm) |
| `better-sqlite3` | `^12.6.2` | Fast synchronous SQLite driver | [npm](https://www.npmjs.com/package/better-sqlite3) |
| `commander` | `^13.1.0` | CLI framework | [npm](https://www.npmjs.com/package/commander) |
| `chalk` | `^5.4.x` | Terminal string styling | [npm](https://www.npmjs.com/package/chalk) |
| `ora` | `^8.2.x` | Terminal spinners | [npm](https://www.npmjs.com/package/ora) |
| `ulid` | `^2.3.0` | Universally Unique Lexicographically Sortable Identifier | [npm](https://www.npmjs.com/package/ulid) |
| `pino` | `^9.6.x` | Fast structured JSON logger | [npm](https://www.npmjs.com/package/pino) |
| `pino-pretty` | `^13.x` | Pretty-print pino logs in dev | [npm](https://www.npmjs.com/package/pino-pretty) |
| `dot-prop` | `^9.x` | Get/set nested object properties | [npm](https://www.npmjs.com/package/dot-prop) |
| `fast-json-stable-stringify` | `^2.1.0` | Deterministic JSON.stringify for cache keys | [npm](https://www.npmjs.com/package/fast-json-stable-stringify) |
| `zod-to-json-schema` | `^3.x` | Convert Zod schemas to JSON Schema (if `z.toJSONSchema()` is insufficient) | [npm](https://www.npmjs.com/package/zod-to-json-schema) |

### Dev Dependencies

| Package | Version | Purpose | Link |
|---|---|---|---|
| `turbo` | `^2.8.10` | Monorepo build system | [npm](https://www.npmjs.com/package/turbo) |
| `typescript` | `^5.7.x` | TypeScript compiler | [npm](https://www.npmjs.com/package/typescript) |
| `tsup` | `^8.5.1` | Zero-config TypeScript bundler | [npm](https://www.npmjs.com/package/tsup) |
| `vitest` | `^4.0.18` | Testing framework | [npm](https://www.npmjs.com/package/vitest) |
| `@biomejs/biome` | `^1.9.x` | Linter + formatter (replaces ESLint + Prettier) | [npm](https://www.npmjs.com/package/@biomejs/biome) |
| `drizzle-kit` | `^0.30.x` | Drizzle migration CLI | [npm](https://www.npmjs.com/package/drizzle-kit) |
| `@types/better-sqlite3` | `^7.6.x` | Type definitions | [npm](https://www.npmjs.com/package/@types/better-sqlite3) |
| `@types/node` | `^22.x` | Node.js type definitions | [npm](https://www.npmjs.com/package/@types/node) |
| `tsx` | `^4.x` | TypeScript execution for dev scripts | [npm](https://www.npmjs.com/package/tsx) |

### Dashboard Dependencies (React)

| Package | Version | Purpose |
|---|---|---|
| `react` | `^19.x` | UI library |
| `react-dom` | `^19.x` | DOM renderer |
| `tailwindcss` | `^4.x` | Utility-first CSS |
| `@tanstack/react-query` | `^5.x` | Server state management |
| `react-router` | `^7.x` | Client-side routing |
| `lucide-react` | `^0.470.x` | Icons |

---

## Node.js Version

**Required: Node.js 22.x LTS** (current LTS as of Feb 2026)

Specified in:
- `package.json` → `"engines": { "node": ">=22.0.0" }`
- `.nvmrc` → `22`
- GitHub Actions → `node-version: '22'`

Rationale: Playwright 1.58.x requires Node 20.x, 22.x, or 24.x. Node 22 is the active LTS.

## Package Manager

**pnpm** (latest v9.x)

- Disk-efficient via content-addressable store
- `pnpm-workspace.yaml` for monorepo workspace config
- Strict mode (`shamefully-hoist: false`) prevents phantom dependency issues
- Specified via `"packageManager": "pnpm@9.x"` in root `package.json` with corepack

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
```

## Monorepo Structure

```
fireapi/
├── packages/
│   ├── browser/      # @fireapi/browser
│   │   ├── src/
│   │   ├── tests/
│   │   ├── package.json
│   │   └── tsup.config.ts
│   ├── core/         # @fireapi/core
│   ├── server/       # @fireapi/server
│   ├── cli/          # @fireapi/cli
│   ├── recorder/     # @fireapi/recorder
│   └── dashboard/    # @fireapi/dashboard
├── drizzle/
│   ├── schema.ts
│   └── migrations/
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── biome.json
├── vitest.workspace.ts
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── .nvmrc
├── .env.example
├── LICENSE
└── README.md
```

## Turborepo Configuration

```jsonc
// turbo.json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    }
  }
}
```

## Build Configuration (tsup)

Each package uses tsup for building:

```typescript
// packages/core/tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
  splitting: false,
});
```

## TypeScript Configuration

```jsonc
// tsconfig.base.json (root)
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "exclude": ["node_modules", "dist"]
}
```

Each package extends this:
```jsonc
// packages/core/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [
    { "path": "../browser" }
  ]
}
```

## Vulnerability Management

- `pnpm audit` runs in CI on every PR
- Dependabot configured for weekly checks
- Critical/high severity vulns block merge
- Use `pnpm update --interactive` for controlled updates
- Lock file (`pnpm-lock.yaml`) committed and validated in CI

## Key Decision: Why NOT These Alternatives

| Rejected | Why |
|---|---|
| Express.js | Slower, heavier, no native TS types for routes |
| Fastify | Good but Hono is lighter, faster, Web Standards based |
| Puppeteer | Playwright has better multi-browser support, auto-wait, official CDP |
| Prisma | Too heavy for SQLite use case; Drizzle is lighter, type-safer |
| Jest | Vitest is faster, native ESM, Vite-powered |
| ESLint + Prettier | Biome does both in one tool, 10-100x faster |
| npm workspaces | pnpm is faster, stricter, more disk-efficient |
| Lerna | Turborepo is faster, simpler, better caching |
