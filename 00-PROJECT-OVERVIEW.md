# FireAPI — Turn Any Interactive Website into a Typed REST API

> **Codename:** `fireapi`
> **Tagline:** The compiler that turns websites into APIs.
> **License:** MIT
> **Language:** TypeScript (end-to-end)
> **Target:** Open-source tool built on [Firecrawl Browser Sandbox](https://docs.firecrawl.dev/features/browser)

---

## What Is This?

FireAPI is an open-source platform that **converts interactive web pages into fully typed, documented REST APIs**. Point it at a URL with forms, dropdowns, pagination, and data tables — it discovers every interactive element, builds a deterministic workflow graph, infers input/output schemas, and serves a live API with auto-generated OpenAPI 3.1 documentation.

Unlike AI-based browser agents (e.g. Skyvern) that **interpret** pages at runtime with LLMs, FireAPI is a **compiler**: analyze once, build a typed workflow graph, replay mechanically. This means deterministic results, sub-second latency after first run, and zero LLM cost per request.

## Why Firecrawl?

[Firecrawl](https://firecrawl.dev) is the web data API for AI. Its [Browser Sandbox](https://docs.firecrawl.dev/features/browser) (launched Feb 17, 2026) provides:

- **Secure, isolated browser sessions** — zero-config, fully managed Chromium containers
- **CDP WebSocket access** — connect Playwright directly via `wss://cdp-proxy.firecrawl.dev/cdp/...`
- **Live View URLs** — watch sessions in real time for debugging/demos
- **Playwright pre-installed** — full browser automation capabilities
- **Massive parallelism** — up to 20 concurrent sessions, scales to hundreds

FireAPI uses Browser Sandbox as its execution engine. Every API call spins up (or reuses) a Firecrawl session, replays the workflow, extracts data, and returns typed JSON. No local browsers, no infrastructure to manage.

## Core Value Proposition

| Existing Tool | What It Does | What's Missing |
|---|---|---|
| [Maxun](https://github.com/getmaxun/maxun) | Manual bot config → REST API | No auto-discovery, no typed schemas, no OpenAPI |
| [Skyvern](https://skyvern.com) | LLM interprets forms at runtime | Non-deterministic, expensive per-request, no versioned schemas |
| [Browserbase](https://browserbase.com) | Programmable headless browser | Developer writes all logic themselves |
| [Axiom.ai](https://axiom.ai) | No-code workflow recording | No typed REST APIs, no OpenAPI output |

**FireAPI uniquely combines:**
1. Auto-discovery of interactive elements via CDP
2. Typed, versioned workflow DAGs
3. Deterministic schema inference (no LLM)
4. Each workflow → typed REST endpoint + OpenAPI 3.1
5. On-demand execution via Firecrawl Browser Sandbox
6. Self-healing with selector fallback strategies

## Package Architecture

```
fireapi/
├── packages/
│   ├── @fireapi/browser     # CDP interaction, Firecrawl integration, element discovery
│   ├── @fireapi/core        # Workflow graph, schema inference engine, step types
│   ├── @fireapi/server      # Hono API server, dynamic routes, OpenAPI generation
│   ├── @fireapi/cli         # CLI interface (discover, init, serve, export, heal)
│   ├── @fireapi/recorder    # Browser-based workflow recording + post-processing
│   └── @fireapi/dashboard   # React management UI
├── turbo.json
├── package.json
└── tsconfig.base.json
```

## Build Order & MVP

### Phase 1: Core Engine (Ship Demo Video)
1. `@fireapi/browser` — CDP element discovery, form analysis, interaction primitives
2. `@fireapi/core` — Workflow graph data structure, schema inference engine
3. `@fireapi/server` — API server with dynamic routes, OpenAPI generation
4. `@fireapi/cli` — init/serve/export commands
5. **🎬 SHIP DEMO VIDEO** → Firecrawl Twitter post

### Phase 2: Power Features
6. `@fireapi/recorder` — Browser-based workflow recording
7. `@fireapi/dashboard` — Management UI
8. Self-healing / monitoring layer

### MVP Demo (< 60 seconds)
1. Point CLI at a public records search page
2. Show auto-discovery output (inputs, dropdowns, submit, results table)
3. Show generated workflow graph
4. Show API server with OpenAPI docs in browser
5. Hit API with curl → typed JSON response

## Estimated Scale

| Area | Lines |
|---|---|
| Browser engine + CDP | ~8,000 |
| Workflow representation | ~3,000 |
| Schema inference | ~3,000 |
| API server + execution | ~5,000 |
| OpenAPI generation | ~2,000 |
| Workflow recorder | ~4,000 |
| Change detection + self-healing | ~3,000 |
| Dashboard UI | ~6,000 |
| CLI + configuration | ~2,000 |
| Tests | ~5,000+ |
| **Total** | **~41,000+** |

## Key Links

- Firecrawl Docs: https://docs.firecrawl.dev
- Browser Sandbox Docs: https://docs.firecrawl.dev/features/browser
- Firecrawl Node SDK: https://www.npmjs.com/package/@mendable/firecrawl-js
- Firecrawl GitHub: https://github.com/mendableai/firecrawl
- Firecrawl MCP Server: https://github.com/firecrawl/firecrawl-mcp-server
- OpenAPI 3.1 Spec: https://spec.openapis.org/oas/v3.1.0
- Playwright Docs: https://playwright.dev/docs/intro
- Hono Framework: https://hono.dev/docs/
- Zod v4: https://zod.dev/v4
- Turborepo: https://turborepo.dev/docs
