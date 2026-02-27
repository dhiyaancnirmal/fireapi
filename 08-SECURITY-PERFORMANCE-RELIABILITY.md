# 08 — Security, Performance, Scalability, Concurrency & Reliability

## Security

### Threat Model

| Threat | Mitigation |
|---|---|
| Firecrawl API key exposure | Store in env var, never in code/config files. `.env` in `.gitignore` |
| SQL injection | Drizzle ORM parameterized queries — no raw string interpolation |
| XSS in dashboard | React auto-escapes by default. CSP headers via Hono middleware |
| Malicious workflow configs | JSON Schema validation on all workflow imports. No `eval()` anywhere |
| Credential leakage in logs | Pino redaction: `redact: ['*.apiKey', '*.password', '*.cookie']` |
| Denial of service via session exhaustion | `FIREAPI_MAX_CONCURRENT_SESSIONS` enforced. Request queuing with backpressure |
| Scraped data sensitivity | Data stays local (SQLite). No telemetry. No external data transmission except to Firecrawl API |
| Dashboard access | Optional `FIREAPI_API_KEY` bearer auth. Recommend reverse proxy auth for production |

### Security Practices

- **No `eval()` or `new Function()`** anywhere in the codebase
- **Input validation** on every endpoint via Zod schemas
- **Dependency auditing** via `pnpm audit` in CI
- **SQLite WAL mode** — prevents corruption from concurrent access
- **No secrets in workflow configs** — credentials stored separately in encrypted env vars
- **Rate limiting on management endpoints** — via Hono middleware
- **CORS** — configurable, defaults to same-origin in production

### Auth for Dashboard (Optional)

```typescript
import { bearerAuth } from 'hono/bearer-auth';

if (process.env.FIREAPI_API_KEY) {
  app.use('/api/*', bearerAuth({ token: process.env.FIREAPI_API_KEY }));
}
```

---

## Performance

### Latency Targets

| Operation | Target | Strategy |
|---|---|---|
| Cached API response | < 50ms | In-memory cache lookup |
| Uncached API response (simple form) | < 5s | Session pooling, warm browsers |
| Uncached API response (complex multi-step) | < 15s | Parallel step execution where possible |
| Discovery on a page | < 10s | Single CDP traversal, no LLM |
| Schema inference (5 sample runs) | < 60s | Parallel sample executions |
| CLI startup | < 500ms | Lazy imports, no eager DB connection |
| Health check per workflow | < 10s | Reuse session pool |

### Caching Strategy

**Three cache layers:**

1. **Response Cache** (in-memory, per endpoint)
   - Key: `hash(workflow_id + sorted_input_params)`
   - TTL: configurable per workflow (default 300s)
   - Max entries: configurable (default 1000)
   - Eviction: LRU
   - Implementation: `Map<string, { data: unknown; expiresAt: number }>`

2. **Session Pool** (warm browser sessions)
   - Pool of pre-created Firecrawl sessions waiting for requests
   - Size: configurable (default 3)
   - Reduces cold-start latency from ~3s to ~200ms
   - Sessions recycled after N uses or on error

3. **Discovery Cache** (SQLite)
   - Store discovery results per URL
   - Avoid re-discovering pages that haven't changed
   - TTL: 24 hours or manual refresh

### Performance Optimizations

- **Playwright connection reuse**: connect once per session, execute multiple steps
- **Parallel step execution**: DAG topology allows independent steps to run concurrently
- **Lazy loading**: packages loaded on-demand (e.g., dashboard only loaded if `FIREAPI_DASHBOARD_ENABLED=true`)
- **Stream responses**: for large extraction results, stream JSON array items
- **Warm session recycling**: instead of creating/destroying per request, reuse sessions with `page.goto()` reset
- **Deterministic hashing**: `fast-json-stable-stringify` for consistent cache keys

---

## Scalability

### Scaling Dimensions

This is a self-hosted tool, not a SaaS. Scalability means "works well on a single machine under increasing load."

| Dimension | Approach |
|---|---|
| More workflows | SQLite handles thousands of rows trivially. Dynamic route registration is O(n) at startup |
| More concurrent requests | Bounded by `FIREAPI_MAX_CONCURRENT_SESSIONS`. Excess requests queue with backpressure |
| More data per extraction | Streaming extraction for tables with 1000+ rows |
| More frequent health checks | Batch health checks, reuse sessions across workflows |
| Larger workflow graphs | DAG execution is O(V+E), efficient for any reasonable workflow size |

### Firecrawl Session Limits

- Free tier: limited concurrent sessions
- Paid tiers: up to 20 concurrent sessions
- Session pooling amortizes creation cost
- Queue overflow returns 503 with retry-after header

### Horizontal Scaling (Future)

If someone wanted to deploy this at scale:
- Multiple instances behind load balancer
- Replace SQLite with PostgreSQL (Drizzle supports both)
- Replace in-memory cache with Redis
- Centralized session pool via Redis coordination
- These are NOT MVP concerns

---

## Concurrency

### Concurrency Model

```
Incoming Request ──→ Request Queue (bounded) ──→ Session Pool
                                                    │
                                                    ├── Session 1 → Workflow Executor → Response
                                                    ├── Session 2 → Workflow Executor → Response
                                                    └── Session 3 → Workflow Executor → Response
```

### Concurrency Controls

```typescript
// Session pool with semaphore pattern
class SessionPool {
  private available: FirecrawlSession[] = [];
  private waitQueue: Array<(session: FirecrawlSession) => void> = [];
  private activeCount = 0;
  private readonly maxConcurrent: number;

  async acquire(): Promise<FirecrawlSession> {
    if (this.available.length > 0) {
      this.activeCount++;
      return this.available.pop()!;
    }
    
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount++;
      return this.createSession();
    }
    
    // Wait for a session to become available
    return new Promise((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(session: FirecrawlSession): void {
    this.activeCount--;
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      this.activeCount++;
      next(session);
    } else {
      this.available.push(session);
    }
  }
}
```

### Race Condition Prevention

| Scenario | Protection |
|---|---|
| Concurrent writes to same workflow | SQLite WAL mode + Drizzle transactions |
| Session pool contention | Semaphore-based acquire/release |
| Cache stampede (many requests for same uncached key) | Lock per cache key — first request computes, others wait |
| Health check during workflow update | Read-write lock on workflow config |
| Concurrent discovery on same URL | Deduplicate — return existing in-flight result |

### Backpressure

When all sessions are in use and the wait queue exceeds a threshold:
```typescript
if (this.waitQueue.length > MAX_QUEUE_SIZE) {
  throw new SessionError('Server at capacity', {
    retryAfter: estimatedWaitSeconds,
    queuePosition: this.waitQueue.length,
  });
}
```

Returns HTTP 503 with `Retry-After` header.

---

## Reliability & Fault Tolerance

### Failure Modes & Recovery

| Failure | Detection | Recovery |
|---|---|---|
| Firecrawl session timeout | CDP connection error / timeout | Retry with new session (max 2 retries) |
| Selector not found | `page.locator().count() === 0` | Try fallback selectors in order of confidence |
| Page structure changed | Output schema mismatch | Self-healing: attempt selector repair, log change |
| Firecrawl API down | Connection refused / 5xx | Return 503 with helpful error, retry with exponential backoff |
| SQLite corruption | Drizzle query error | WAL mode prevents most corruption. Backup on startup |
| OOM on large extraction | Process memory limit | Stream results, limit extraction batch size |
| Workflow infinite loop | Step counter exceeds `maxIterations` | Abort with clear error, mark workflow as needs-review |

### Retry Policy

```typescript
const RETRY_CONFIG = {
  maxRetries: 2,
  baseDelay: 1000,      // 1 second
  maxDelay: 10000,       // 10 seconds
  backoffMultiplier: 2,  // exponential
  retryableErrors: [
    'SESSION_ERROR',
    'TIMEOUT',
    'CDP_DISCONNECTED',
  ],
  nonRetryableErrors: [
    'VALIDATION_ERROR',
    'WORKFLOW_BROKEN',
    'SELECTOR_NOT_FOUND', // after all fallbacks exhausted
  ],
};
```

### Self-Healing Pipeline

```
1. Health check daemon runs periodically (configurable interval)
2. For each active workflow:
   a. Execute with test inputs
   b. Compare output against baseline schema
   c. If match → status = "active", done
   d. If mismatch:
      i.   Try each fallback selector for broken steps
      ii.  If fallback works → update workflow, status = "healed", log change
      iii. If no fallback works → status = "broken", send alert
3. Log all results to health_checks table
4. Update workflow_changelog with any changes
```

### Graceful Shutdown

```typescript
const server = serve(app);

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  
  // 1. Stop accepting new requests
  server.close();
  
  // 2. Wait for in-flight requests to complete (30s timeout)
  await Promise.race([
    waitForInflightRequests(),
    sleep(30_000),
  ]);
  
  // 3. Release all browser sessions
  await sessionPool.destroyAll();
  
  // 4. Close database
  db.close();
  
  logger.info('Shutdown complete');
  process.exit(0);
});
```
