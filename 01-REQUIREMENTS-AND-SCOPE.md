# 01 — Requirements & Scope

## What We Are Building

An open-source CLI-first platform that converts interactive web pages into fully typed REST APIs using Firecrawl Browser Sandbox as the execution engine.

### Functional Requirements

#### FR-1: Automated Page Discovery
- Given a URL, launch a Firecrawl Browser Sandbox session
- Introspect the page via CDP (Chrome DevTools Protocol)
- Identify all interactive elements: text inputs, dropdowns (enumerate options), checkboxes, radio buttons, date pickers, file upload fields, submit buttons, pagination controls (numbered, infinite scroll, load-more), data tables (headers, row structure, column types)
- Detect form dependencies (e.g. country dropdown changes state dropdown options)
- Output: structured JSON map of every interactive element with multiple selector strategies

#### FR-2: Workflow Definition (Three Methods)
- **Auto-generated**: system detects common patterns (search form → results table) and proposes workflows with sensible defaults
- **Manual configuration**: JSON/YAML config defining each step explicitly for complex multi-page flows
- **Recorded**: live browser session where user clicks through; system records actions, post-processes to remove noise, identifies parameters vs constants

#### FR-3: Workflow Graph Representation
- Directed acyclic graph of typed steps: Navigate, Fill, Select, Click, Wait, Extract, Assert, Branch, Loop
- Multiple selector strategies per step (CSS, XPath, ARIA, text content, DOM position)
- Versioned, serializable JSON format, diffable, portable

#### FR-4: Schema Inference (Deterministic, No LLM)
- Run workflow N times with varied inputs
- Observe extracted data, infer types from value patterns
- Detect nullable fields, arrays vs objects
- Build JSON Schema + Zod schema
- Infer input schema (required/optional params, types, enum values from dropdowns)
- Pure pattern matching and type coercion rules — zero LLM cost

#### FR-5: API Server
- Each workflow → REST endpoint
- Request validation against input schema (Zod)
- Acquire Firecrawl Browser Sandbox session → execute workflow → extract results → validate output
- Session pooling for concurrent requests
- Configurable response caching with TTL
- Structured error handling with failed step details

#### FR-6: OpenAPI 3.1 Generation
- Each workflow → endpoint in spec
- Input params → request schema with types/descriptions/enums
- Output schema → response schema with full types
- Real examples from actual executions
- Served at `/openapi.json`, rendered as interactive docs at `/docs`

#### FR-7: Workflow Recorder
- Live Browser Sandbox session in iframe/proxy
- Capture all DOM events (clicks, keystrokes, navigations)
- Post-process: collapse redundant events, remove accidents, identify parameters
- User reviews generated workflow, adjusts names, marks extraction targets

#### FR-8: Change Detection & Self-Healing
- Monitoring daemon periodically re-executes workflows with test inputs
- Compare results against baseline schema, flag schema changes
- Selector breakage → attempt fallback selectors (CSS → ARIA → text → position)
- Auto-recovery succeeds → update workflow, log change
- Auto-recovery fails → mark broken, send alerts
- Maintain changelog per workflow

#### FR-9: CLI
| Command | Description |
|---|---|
| `fireapi discover <url>` | Run discovery, output element map |
| `fireapi init <url>` | Discover + auto-generate workflows + infer schemas |
| `fireapi record <url>` | Open recording session |
| `fireapi serve` | Start API server |
| `fireapi test` | Execute all workflows, verify health |
| `fireapi export --openapi` | Dump OpenAPI spec |
| `fireapi export --postman` | Export Postman collection |
| `fireapi diff` | Show changes since last test |
| `fireapi heal` | Auto-fix broken selectors |

#### FR-10: Dashboard UI
- Visual workflow editor (drag steps, add branches)
- Live execution viewer (streamed browser session via Live View URL)
- API health monitoring (healthy / degraded / broken)
- Execution logs (timing, params, output, errors)
- Schema explorer (view types, see diffs)
- Endpoint explorer (embedded OpenAPI docs)
- Credential management (auth for login-required sites)

---

## What We Are NOT Building

| Excluded | Reason |
|---|---|
| Authentication / login flows | MVP scoped to publicly accessible pages. Roadmap item. |
| CAPTCHA solving | Legal and ethical complexity. Explicitly out of scope. |
| LLM-based extraction | Core thesis is deterministic, zero-LLM execution. |
| Scheduling / cron | Users can wrap CLI in cron/Temporal themselves. |
| SaaS / hosted platform | This is an open-source tool. Self-host only. |
| Mobile app scraping | Web pages only. |
| Browser extension | CLI-first approach. |
| Multi-tenant auth system | Single-user tool. Dashboard has no user accounts. |
| Rate limiting upstream sites | User's responsibility to respect robots.txt and ToS. |

---

## Success Criteria

1. **Demo video**: < 60 seconds, end-to-end from `fireapi init <url>` to `curl` returning typed JSON
2. **Founder test**: Would Firecrawl's founder ([@nickscamara_](https://x.com/nickscamara_)) retweet this?
3. **Technical depth**: 30k+ LOC of real engineering, not a wrapper
4. **Novel combination**: No existing OSS tool does auto-discovery + typed workflow DAGs + schema inference + OpenAPI generation + cloud browser execution
5. **Zero LLM dependency**: Core pipeline is purely deterministic
