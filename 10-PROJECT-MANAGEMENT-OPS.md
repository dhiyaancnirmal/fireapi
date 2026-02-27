# 10 — Project Management, Release Strategy, Monitoring & Operations

## Project Roadmap & Milestones

### Phase 1: Core Engine (Weeks 1-3)
**Goal: End-to-end CLI demo video**

| Milestone | Package | Deliverable |
|---|---|---|
| M1: Browser Foundation | `@fireapi/browser` | Session management, CDP discovery, element interaction primitives, selector engine |
| M2: Workflow Engine | `@fireapi/core` | Workflow graph structure, executor, serializer, auto-generator |
| M3: Schema Inference | `@fireapi/core` | Type detector, inference engine, Zod builder |
| M4: API Server | `@fireapi/server` | Dynamic routes, request/response validation, OpenAPI generation |
| M5: CLI MVP | `@fireapi/cli` | `discover`, `init`, `serve`, `export` commands |
| M6: Demo Video | — | 🎬 < 60s Screen Studio demo, tweet at Firecrawl |

### Phase 2: Power Features (Weeks 4-5)
| Milestone | Package | Deliverable |
|---|---|---|
| M7: Recorder | `@fireapi/recorder` | Live session recording, event capture, workflow generation |
| M8: Self-Healing | `@fireapi/core` | Health checks, selector fallback, auto-recovery |
| M9: Dashboard MVP | `@fireapi/dashboard` | Workflow list, execution logs, health status |

### Phase 3: Polish & Community (Week 6+)
| Milestone | Deliverable |
|---|---|
| M10: Dashboard full | Visual editor, live viewer, schema explorer |
| M11: Documentation | Comprehensive README, guides, examples |
| M12: Community | Issue templates, contributing guide, Discord |

### Task Tracking

- **GitHub Issues** with labels: `package:browser`, `package:core`, `package:server`, `package:cli`, `package:recorder`, `package:dashboard`
- **GitHub Projects** (kanban board): Backlog → In Progress → Review → Done
- **Milestones** match the phases above
- No external tool needed — single developer, GitHub is sufficient

---

## Version Control Workflow

### Branching Strategy

**Trunk-based development** (solo developer, fast iteration):

```
main ──────────────────────────────────────────→
  \                         /
   └── feat/browser-discovery ─────┘
  \                              /
   └── feat/workflow-executor ──┘
  \                    /
   └── fix/selector-fallback ┘
```

- `main` is always deployable
- Feature branches: `feat/<description>`
- Bug fixes: `fix/<description>`
- PRs for documentation/review trail (even solo)
- Squash merge to main

### Commit Convention

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat(browser): add CDP element discovery
fix(core): handle null values in schema inference
docs: add architecture diagram to README
test(server): add OpenAPI generation tests
chore: update dependencies
refactor(cli): extract spinner utilities
```

### Code Review

- Self-review via PR descriptions documenting design decisions
- CI must pass before merge
- Build in public: PRs are visible, progress is documented

---

## Release Strategy

### Versioning

[Semantic Versioning](https://semver.org/) for all packages:
- Pre-1.0: `0.x.y` — breaking changes allowed in minor versions
- Post-1.0: standard semver

All packages share the same version number (monorepo single-version strategy).

### Release Process

1. Update version in all `package.json` files
2. Create git tag: `v0.1.0`
3. Push tag triggers GitHub Actions release workflow
4. Packages published to npm under `@fireapi/` scope
5. GitHub Release created with auto-generated changelog

### Feature Flags

Simple environment-variable-based feature flags for progressive rollout:

```typescript
export const FEATURES = {
  RECORDER_ENABLED: process.env.FIREAPI_FEATURE_RECORDER === 'true',
  DASHBOARD_ENABLED: process.env.FIREAPI_DASHBOARD_ENABLED !== 'false', // default on
  AUTO_HEAL_ENABLED: process.env.FIREAPI_AUTO_HEAL !== 'false',        // default on
  SESSION_POOLING: process.env.FIREAPI_SESSION_POOLING !== 'false',    // default on
} as const;
```

---

## Monitoring & Alerts

### Health Endpoint

```
GET /health

{
  "status": "healthy",          // healthy | degraded | unhealthy
  "uptime": 86400,
  "version": "0.1.0",
  "workflows": {
    "total": 3,
    "active": 2,
    "degraded": 1,
    "broken": 0
  },
  "sessions": {
    "active": 2,
    "pooled": 1,
    "maxConcurrent": 5
  },
  "database": {
    "status": "connected",
    "executionsLast24h": 142,
    "dbSizeBytes": 524288
  }
}
```

### SLIs / SLOs (Self-Hosted Context)

Not traditional SaaS SLOs, but internal quality metrics:

| SLI | Target | Alert Threshold |
|---|---|---|
| Workflow success rate (per workflow) | > 95% | < 80% over 1 hour |
| API response time (cached) | < 100ms p95 | > 500ms |
| API response time (uncached) | < 10s p95 | > 30s |
| Self-healing success rate | > 80% | < 50% |
| Session pool availability | > 90% | < 50% (all sessions busy) |

### Alert Channels

For self-hosted tool, alerts are:
1. **Log-based**: `logger.warn()` / `logger.error()` — users pipe to their alerting system
2. **Dashboard**: health status badges, broken workflow indicators
3. **CLI**: `fireapi status` shows health summary
4. **Webhook** (optional): configurable webhook URL for critical alerts

```typescript
// Optional webhook alerting
if (config.alertWebhookUrl) {
  await fetch(config.alertWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'workflow_broken',
      workflow: workflowId,
      message: 'All selectors failed for step click_submit',
      timestamp: new Date().toISOString(),
    }),
  });
}
```

---

## Analytics & Instrumentation

### Product Metrics (Self-Hosted, Local Only)

Stored in SQLite, queryable via dashboard:

| Metric | Source |
|---|---|
| Workflows created / active / broken | `workflows` table |
| Executions per day/hour | `executions` table |
| Success/failure rate per workflow | `executions` table |
| Average execution duration per workflow | `executions` table |
| Self-healing events | `health_checks` table |
| Cache hit rate | In-memory counter |
| Session pool utilization | In-memory counter |

### No External Telemetry

- **Zero telemetry to Anthropic, Firecrawl, or anyone else**
- All metrics are local to the user's SQLite database
- Users opt-in to sharing by choice (e.g., GitHub stars, Twitter posts)

---

## Compliance & Privacy

### Data Handling

| Data Type | Storage | Sensitivity | Handling |
|---|---|---|---|
| Workflow configs | SQLite | Low | User-defined, versioned |
| Extracted data | SQLite (executions table) | **Potentially High** | User's responsibility to assess |
| Firecrawl API key | Environment variable | High | Never stored in DB or logs |
| Browser session data | Firecrawl (transient) | Medium | Sessions auto-destroy after TTL |
| Logs | Filesystem / stdout | Medium | Pino redaction for sensitive fields |

### Legal Disclaimers (in README)

```markdown
## ⚠️ Legal & Compliance

FireAPI is a tool for automating web interactions. Users are responsible for:

- **Respecting robots.txt** and website Terms of Service
- **Compliance with data privacy regulations** (GDPR, CCPA, etc.) for any data extracted
- **Not using this tool for** unauthorized access, scraping behind auth without permission, 
  or any activity that violates applicable laws
- **Rate limiting** requests to avoid overwhelming target websites

FireAPI does not transmit any data to third parties except Firecrawl 
(for browser session management via their API).
```

### GDPR Considerations

- All data is stored locally (user's machine)
- No PII transmitted to external services (Firecrawl receives URLs, not extracted data)
- Users extracting PII from websites must handle GDPR compliance themselves
- Data retention is configurable via `FIREAPI_EXECUTION_RETENTION_DAYS`

---

## Backups & Recovery

### SQLite Backup Strategy

```typescript
// Automatic backup on server startup
import { copyFileSync } from 'fs';

function backupDatabase(dbPath: string): void {
  const backupPath = `${dbPath}.backup.${Date.now()}`;
  copyFileSync(dbPath, backupPath);
  logger.info({ backupPath }, 'Database backed up');
  
  // Keep only last 5 backups
  pruneOldBackups(dbPath, 5);
}
```

- Backup on every server startup
- Backup before schema migrations
- Keep last 5 backups, auto-prune older
- WAL mode ensures consistent backups even during writes

### Disaster Recovery

| Scenario | Recovery |
|---|---|
| Database corruption | Restore from most recent backup |
| Workflow configs lost | Re-run `fireapi init` on target URLs |
| Execution history lost | Non-critical, only affects analytics |
| Self-healing broke a workflow | Revert via `workflow_changelog` diffs |

---

## Operational Costs

### Firecrawl Pricing (as of Feb 2026)

- **Free tier**: 500 credits/month
- **Browser Sandbox**: 2 credits per browser minute, 5 minutes free per session
- Typical API call: 5-15 seconds = ~0.17-0.5 credits

### Cost Optimization Strategies

| Strategy | Savings |
|---|---|
| Response caching | Eliminates repeat executions (biggest lever) |
| Session pooling | Reduces session creation overhead |
| Warm session reuse | Avoid cold start per request |
| Health check batching | Single session for multiple workflow checks |
| Configurable cache TTL per workflow | High-traffic endpoints get longer TTL |

### Estimated Monthly Cost

| Usage Pattern | Monthly Executions | Estimated Credits | Estimated Cost |
|---|---|---|---|
| Light (dev/testing) | ~100 | ~50 | Free tier |
| Moderate (small API) | ~1,000 | ~500 | ~$19/mo (Hobby plan) |
| Heavy (production API) | ~10,000 | ~5,000 | ~$49/mo (Standard plan) |

---

## Technical Debt Management

### Tracking

- `// TODO(username): description` comments for small items
- GitHub Issues labeled `tech-debt` for larger items
- Dedicated "Tech Debt Friday" if working full-time

### Known Debt Decisions

| Decision | Why It's Debt | When to Fix |
|---|---|---|
| In-memory cache (no Redis) | Won't survive restarts | When users report cache issues |
| SQLite (not Postgres) | Single-writer limitation | When horizontal scaling needed |
| No auth system | Insecure for public deployment | Before v1.0 |
| No rate limiting on upstream sites | User could hammer target sites | Add configurable rate limiter in M8 |
| Simple session pool (no Redis coordination) | Can't share across processes | When horizontal scaling needed |

### Refactoring Triggers

- Function exceeds 50 lines → extract
- File exceeds 300 lines → split
- Cognitive complexity > 15 → simplify
- Test coverage drops below target → write tests before new features
- Same pattern copy-pasted 3 times → extract utility

---

## Onboarding & Knowledge Sharing

### README Structure

```
README.md
├── What is FireAPI?
├── Quick Start (< 5 minutes)
│   ├── Prerequisites
│   ├── Installation
│   └── First API in 60 seconds
├── How It Works
│   ├── Discovery
│   ├── Workflow Generation
│   ├── Schema Inference
│   └── API Serving
├── CLI Reference
├── Configuration
├── Dashboard
├── Architecture
├── Contributing
├── Legal & Compliance
└── License
```

### Contributing Guide

```
CONTRIBUTING.md
├── Development Setup
├── Project Structure
├── Running Tests
├── Code Style (Biome)
├── Commit Convention
├── PR Process
└── Release Process
```

### Architecture Decision Records

Store in `docs/adr/`:
```
docs/adr/
├── 001-typescript-monorepo.md
├── 002-firecrawl-browser-sandbox.md
├── 003-hono-over-express.md
├── 004-sqlite-for-storage.md
├── 005-deterministic-schema-inference.md
├── 006-dag-workflow-representation.md
└── 007-multi-selector-strategy.md
```

---

## User Feedback Loop

### Channels

1. **GitHub Issues**: bug reports, feature requests
2. **GitHub Discussions**: Q&A, show-and-tell
3. **Twitter**: build-in-public updates, demo videos
4. **GitHub Stars / Forks**: popularity signals

### Feedback → Action Pipeline

```
User reports issue/request
  → Label + triage (same day)
  → If bug: reproduce, fix, release patch
  → If feature: add to backlog, prioritize against roadmap
  → If question: answer in Discussions, add to FAQ if common
```

### Maintainability Principles

- Every exported function has JSDoc documentation
- Every non-trivial module has a header comment explaining purpose
- Configuration is discoverable via `fireapi --help` and `fireapi.config.ts` types
- Errors are actionable: tell the user what went wrong AND what to do about it
- Breaking changes documented in CHANGELOG.md with migration guide
