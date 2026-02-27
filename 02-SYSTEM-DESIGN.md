# 02 — System Design & Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface Layer                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │   CLI    │  │  Dashboard   │  │  OpenAPI Docs (/docs)     │  │
│  │ (cmdr)   │  │  (React)     │  │  (Scalar / SwaggerUI)     │  │
│  └────┬─────┘  └──────┬───────┘  └────────────┬──────────────┘  │
│       │               │                        │                 │
├───────┴───────────────┴────────────────────────┴─────────────────┤
│                        API Server (Hono)                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ Dynamic Route │ │ OpenAPI Gen  │ │ Session Pool Manager     │ │
│  │ Registry     │ │ (per-workflow)│ │ (Firecrawl connections)  │ │
│  └──────┬───────┘ └──────┬───────┘ └──────────┬───────────────┘ │
│         │                │                     │                  │
├─────────┴────────────────┴─────────────────────┴─────────────────┤
│                        Core Engine                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ Workflow      │ │ Schema       │ │ Workflow Executor        │ │
│  │ Graph Engine  │ │ Inference    │ │ (step-by-step replay)    │ │
│  └──────┬───────┘ └──────┬───────┘ └──────────┬───────────────┘ │
│         │                │                     │                  │
├─────────┴────────────────┴─────────────────────┴─────────────────┤
│                    Browser Abstraction Layer                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│  │ Page         │ │ Element      │ │ Selector Strategy        │ │
│  │ Discovery    │ │ Interaction  │ │ Engine (CSS/XPath/ARIA/   │ │
│  │ (CDP)        │ │ Primitives   │ │ text/position)           │ │
│  └──────┬───────┘ └──────┬───────┘ └──────────┬───────────────┘ │
│         │                │                     │                  │
├─────────┴────────────────┴─────────────────────┴─────────────────┤
│              Firecrawl Browser Sandbox (External)                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  CDP WebSocket: wss://cdp-proxy.firecrawl.dev/cdp/{id}     │ │
│  │  Live View: https://liveview.firecrawl.dev/{id}            │ │
│  │  Playwright pre-installed • Isolated container • Auto-TTL   │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## Package Dependency Graph

```
@fireapi/browser   ← no internal deps (depends on Firecrawl SDK + Playwright)
       ↓
@fireapi/core      ← depends on @fireapi/browser
       ↓
@fireapi/server    ← depends on @fireapi/core + @fireapi/browser
       ↓
@fireapi/cli       ← depends on @fireapi/server + @fireapi/core + @fireapi/browser
       
@fireapi/recorder  ← depends on @fireapi/browser + @fireapi/core
@fireapi/dashboard ← depends on @fireapi/server (HTTP client only)
```

## Data Flow: API Request Lifecycle

```
1. Client sends: GET /api/search?county=harris&property_type=residential&owner_name=smith
                     │
2. Hono route handler │ → validates request against input Zod schema
                     │
3. Check cache        │ → if TTL-valid cached response exists, return immediately
                     │
4. Session Manager    │ → acquire Firecrawl Browser Sandbox session
                     │     POST https://api.firecrawl.dev/v1/browser
                     │     → returns { id, cdpUrl, liveViewUrl }
                     │
5. Connect Playwright │ → playwright.chromium.connectOverCDP(session.cdpUrl)
                     │
6. Workflow Executor  │ → replay workflow DAG step-by-step:
                     │     step 1: Navigate → page.goto(url)
                     │     step 2: Fill "county" → page.fill(selector, "harris")
                     │     step 3: Select "property_type" → page.selectOption(selector, "residential")
                     │     step 4: Fill "owner_name" → page.fill(selector, "smith")
                     │     step 5: Click submit → page.click(selector)
                     │     step 6: Wait → page.waitForSelector(resultsTable)
                     │     step 7: Extract → page.$$eval(rows, extractFn)
                     │
7. Validate output   │ → parse extracted data against output Zod schema
                     │
8. Cache response     │ → store with TTL key = hash(workflow_id + input_params)
                     │
9. Release session    │ → return to pool or destroy
                     │
10. Return JSON       │ → 200 OK with typed response body
```

## Data Flow: Discovery Pipeline

```
1. User runs: fireapi discover https://county-records.gov/search
                     │
2. Launch Sandbox     │ → Firecrawl browser session
                     │
3. Navigate to URL    │ → page.goto(url), wait for networkidle
                     │
4. CDP Introspection  │ → DOM traversal via page.evaluate():
                     │     - Find all <input>, <select>, <textarea>, <button>
                     │     - For each <select>: enumerate all <option> values
                     │     - For each <input>: read type, name, placeholder, aria-label
                     │     - Find <table> elements: extract headers, sample rows
                     │     - Detect pagination: numbered links, next/prev buttons, infinite scroll
                     │     - Detect form groups via <form>, <fieldset>, proximity
                     │
5. Selector Strategy  │ → For each element, generate multiple selectors:
   Generation         │     CSS:  #search-form input[name="county"]
                     │     XPath: //form[@id='search-form']//input[@name='county']
                     │     ARIA:  [aria-label="County"]
                     │     Text:  :has-text("County") + input
                     │     Position: form:nth-child(1) input:nth-child(3)
                     │
6. Dependency         │ → Detect cascading selects:
   Detection          │     Change country → observe state dropdown options change
                     │     Uses MutationObserver on <select> elements
                     │
7. Output JSON        │ → DiscoveryResult with elements, tables, forms, dependencies
```

## Component Responsibilities

### `@fireapi/browser` (Browser Abstraction Layer)
- **FirecrawlSessionManager**: create, pool, destroy Firecrawl Browser Sandbox sessions
- **PageDiscovery**: CDP-based introspection of all interactive elements
- **ElementInteraction**: typed primitives (fill, select, click, wait, extract)
- **SelectorEngine**: generate + rank + resolve multiple selector strategies per element
- **DependencyDetector**: observe DOM mutations to find cascading form relationships

### `@fireapi/core` (Workflow & Schema Engine)
- **WorkflowGraph**: DAG data structure with typed step nodes
- **StepTypes**: Navigate, Fill, Select, Click, Wait, Extract, Assert, Branch, Loop
- **WorkflowExecutor**: traverse DAG, execute steps via browser abstraction
- **SchemaInferenceEngine**: run workflow with varied inputs, observe outputs, infer types
- **WorkflowSerializer**: read/write workflow JSON, validate format, compute diffs
- **AutoWorkflowGenerator**: given DiscoveryResult, propose workflow graphs

### `@fireapi/server` (API Server)
- **DynamicRouteRegistry**: load workflow configs, register Hono routes
- **RequestValidator**: validate incoming requests against input Zod schemas
- **ResponseFormatter**: validate + format output against output schemas
- **SessionPoolManager**: manage Firecrawl session lifecycle for concurrent requests
- **CacheLayer**: in-memory + optional Redis cache with TTL
- **OpenAPIGenerator**: build OpenAPI 3.1 spec from workflow schemas
- **HealthMonitor**: periodic workflow health checks, breakage detection

### `@fireapi/cli` (Command-Line Interface)
- Commander.js-based CLI with subcommands
- Interactive prompts for workflow configuration
- Colored, structured output for discovery results
- Progress indicators for long-running operations

### `@fireapi/recorder` (Workflow Recorder)
- **SessionProxy**: proxy Firecrawl Live View URL for recording
- **EventCapture**: intercept DOM events during user interaction
- **EventPostProcessor**: collapse redundant events, identify parameters
- **WorkflowBuilder**: convert processed events into workflow DAG

### `@fireapi/dashboard` (Management UI)
- React SPA served by the API server
- Visual workflow editor with drag-and-drop
- Live execution viewer (embedded Live View iframe)
- Health dashboard with status indicators
- Execution log browser with filtering/search

## Technology Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript | Firecrawl SDK is TS, Playwright API is TS, OpenAPI tooling strongest in TS, Zod is TS-native |
| Runtime | Node.js 22.x LTS | Stable, Playwright support, native ESM |
| Package manager | pnpm | Fast, disk-efficient, strict mode prevents phantom deps |
| Monorepo tool | [Turborepo](https://turborepo.dev) v2.8.x | Content-aware caching, parallel task execution |
| API framework | [Hono](https://hono.dev) v4.12.x | Ultra-fast, zero-dep, TypeScript-first, Web Standards |
| Validation | [Zod](https://zod.dev/v4) v4.3.x | TS-first, JSON Schema interop via `z.toJSONSchema()` / `z.fromJSONSchema()` |
| Browser automation | [Playwright](https://playwright.dev) v1.58.x | CDP support, auto-wait, multi-selector, industry standard |
| Browser infra | [Firecrawl Browser Sandbox](https://docs.firecrawl.dev/features/browser) | Managed, isolated, scalable, CDP WebSocket access |
| Database | SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) v12.6.x | Zero-config, single-file, perfect for self-hosted tool |
| ORM | [Drizzle ORM](https://orm.drizzle.team) v0.45.x | Type-safe, lightweight, great SQLite support |
| CLI framework | [Commander.js](https://github.com/tj/commander.js) v13.x | Mature, well-typed, ecosystem standard |
| Build | [tsup](https://tsup.egoist.dev) v8.5.x | Zero-config TS bundler powered by esbuild |
| Test | [Vitest](https://vitest.dev) v4.0.x | Fast, Vite-native, TS-first, built-in coverage |
| Lint/Format | [Biome](https://biomejs.dev) v1.9.x | Single tool for lint+format, 10-100x faster than ESLint+Prettier |
| Dashboard UI | React 19 + [Tailwind CSS](https://tailwindcss.com) v4.x | Standard, fast iteration, utility-first |

## Firecrawl Browser Sandbox Integration

### Session Lifecycle
```typescript
import Firecrawl from '@mendable/firecrawl-js';
import { chromium } from 'playwright-core';

// 1. Create session
const firecrawl = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });
const session = await firecrawl.browser({ ttl: 120, activityTtl: 60 });
// session.id: "550e8400-..."
// session.cdpUrl: "wss://cdp-proxy.firecrawl.dev/cdp/550e8400-..."
// session.liveViewUrl: "https://liveview.firecrawl.dev/550e8400-..."

// 2. Connect Playwright
const browser = await chromium.connectOverCDP(session.cdpUrl);
const context = browser.contexts()[0];
const page = context.pages()[0];

// 3. Do work
await page.goto('https://example.com');
const title = await page.title();

// 4. Cleanup
await browser.close();
// Session auto-destroys after TTL or via explicit API call
```

### Cost Model
- **2 credits per browser minute** (5 minutes free per session)
- Session pooling reduces per-request cost
- Caching eliminates redundant executions
- Typical API call: 5-15 seconds of browser time = ~0.17-0.5 credits
