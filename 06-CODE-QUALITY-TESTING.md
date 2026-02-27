# 06 — Code Quality, Standards, Error Handling & Testing

## Coding Standards

### Biome Configuration

Single tool for linting and formatting. [Biome](https://biomejs.dev) replaces ESLint + Prettier.

```jsonc
// biome.json (root)
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "complexity": {
        "noExcessiveCognitiveComplexity": { "level": "warn", "options": { "maxAllowedComplexity": 15 } }
      },
      "suspicious": {
        "noExplicitAny": "warn"
      },
      "style": {
        "useConst": "error",
        "noNonNullAssertion": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  }
}
```

### Naming Conventions

| Entity | Convention | Example |
|---|---|---|
| Files | kebab-case | `workflow-executor.ts` |
| Classes | PascalCase | `WorkflowExecutor` |
| Interfaces | PascalCase (no `I` prefix) | `WorkflowStep` |
| Types | PascalCase | `StepConfig` |
| Functions | camelCase | `executeWorkflow()` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| Enums | PascalCase members | `StepType.Navigate` |
| DB columns | snake_case | `workflow_id` |
| API params | camelCase in JSON, snake_case in query | `?owner_name=smith` |
| Package names | `@fireapi/kebab-case` | `@fireapi/browser` |

### File Organization per Package

```
packages/core/
├── src/
│   ├── index.ts                  # Public API barrel export
│   ├── workflow/
│   │   ├── graph.ts              # WorkflowGraph data structure
│   │   ├── executor.ts           # Step-by-step execution engine
│   │   ├── serializer.ts         # Read/write/validate workflow JSON
│   │   ├── auto-generator.ts     # Auto-generate workflows from discovery
│   │   └── types.ts              # Workflow type definitions
│   ├── schema/
│   │   ├── inference-engine.ts   # Run workflow N times, infer types
│   │   ├── type-detector.ts      # Pattern matching for type inference
│   │   └── zod-builder.ts        # Build Zod schemas from inferred types
│   └── utils/
│       ├── hash.ts               # Deterministic hashing
│       └── diff.ts               # JSON diff utilities
├── tests/
│   ├── workflow/
│   │   ├── graph.test.ts
│   │   ├── executor.test.ts
│   │   └── serializer.test.ts
│   └── schema/
│       ├── inference-engine.test.ts
│       └── type-detector.test.ts
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

### Code Style Rules

- **No default exports** (except in config files). Named exports everywhere for better refactoring, IDE support.
- **Explicit return types** on all exported functions.
- **Result types over exceptions** for business logic. Use a `Result<T, E>` pattern:
  ```typescript
  type Result<T, E = Error> = { ok: true; data: T } | { ok: false; error: E };
  ```
- **Prefer `const` assertions** for literal types.
- **No `any`** — use `unknown` and narrow with type guards.
- **Barrel exports** via `src/index.ts` per package. Only export the public API.
- **Max file size**: aim for < 300 lines. Split when exceeding.
- **Max function size**: aim for < 50 lines. Extract helpers.

---

## Error Handling

### Error Hierarchy

```typescript
// packages/core/src/errors.ts

export class FireAPIError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, statusCode: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'FireAPIError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Discovery errors
export class DiscoveryError extends FireAPIError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'DISCOVERY_FAILED', 500, details);
  }
}

// Workflow execution errors
export class WorkflowExecutionError extends FireAPIError {
  readonly failedStep: string;
  readonly stepIndex: number;
  
  constructor(message: string, failedStep: string, stepIndex: number, details?: Record<string, unknown>) {
    super(message, 'WORKFLOW_EXECUTION_FAILED', 502, details);
    this.failedStep = failedStep;
    this.stepIndex = stepIndex;
  }
}

// Selector resolution errors
export class SelectorError extends FireAPIError {
  readonly selectorsTried: string[];
  
  constructor(message: string, selectorsTried: string[]) {
    super(message, 'SELECTOR_NOT_FOUND', 502, { selectorsTried });
    this.selectorsTried = selectorsTried;
  }
}

// Validation errors
export class ValidationError extends FireAPIError {
  constructor(message: string, details: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

// Session errors  
export class SessionError extends FireAPIError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SESSION_ERROR', 503, details);
  }
}

// Schema inference errors
export class SchemaInferenceError extends FireAPIError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SCHEMA_INFERENCE_FAILED', 500, details);
  }
}
```

### Error Handling Patterns

```typescript
// Pattern 1: Result type for business logic
async function executeStep(step: WorkflowStep, page: Page): Promise<Result<StepResult>> {
  try {
    const selector = await resolveSelector(step.selectors, page);
    if (!selector.ok) {
      return { ok: false, error: new SelectorError('...', step.selectors.map(s => s.value)) };
    }
    // ... execute
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: new WorkflowExecutionError('...', step.id, 0) };
  }
}

// Pattern 2: Hono error handler middleware
app.onError((err, c) => {
  if (err instanceof FireAPIError) {
    return c.json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details }
    }, err.statusCode as any);
  }
  
  logger.error({ err }, 'Unhandled error');
  return c.json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }
  }, 500);
});

// Pattern 3: Selector fallback chain
async function resolveSelector(strategies: SelectorStrategy[], page: Page): Promise<Result<string>> {
  for (const strategy of strategies.sort((a, b) => b.confidence - a.confidence)) {
    try {
      const locator = page.locator(strategy.value);
      if (await locator.count() > 0) {
        return { ok: true, data: strategy.value };
      }
    } catch { /* try next */ }
  }
  return { ok: false, error: new SelectorError('All selectors failed', strategies.map(s => s.value)) };
}
```

---

## Testing Strategy

### Test Pyramid

```
                    ┌─────────┐
                    │  E2E    │  ~10 tests (full pipeline)
                   ┌┴─────────┴┐
                   │Integration │  ~50 tests (multi-package)
                  ┌┴───────────┴┐
                  │  Unit Tests  │  ~200+ tests (per function/module)
                  └──────────────┘
```

### Vitest Configuration

```typescript
// vitest.workspace.ts (root)
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*/vitest.config.ts',
]);
```

```typescript
// packages/core/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        branches: 70,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    testTimeout: 30_000, // browser tests can be slow
  },
});
```

### Test Categories

#### Unit Tests (`tests/unit/`)
- Pure function behavior: type inference, schema generation, workflow serialization, DAG traversal
- Mocked dependencies: no real Firecrawl sessions, no real browsers
- Fast: < 5s for entire unit suite

```typescript
// Example: type-detector.test.ts
describe('TypeDetector', () => {
  it('infers string type from text values', () => {
    const detector = new TypeDetector();
    detector.observe('John');
    detector.observe('Jane');
    detector.observe('Bob');
    expect(detector.infer()).toEqual({ type: 'string' });
  });

  it('infers number type from numeric strings', () => {
    const detector = new TypeDetector();
    detector.observe('285000');
    detector.observe('142500');
    detector.observe('0');
    expect(detector.infer()).toEqual({ type: 'number' });
  });

  it('infers nullable when null/empty observed', () => {
    const detector = new TypeDetector();
    detector.observe('John');
    detector.observe('');
    detector.observe(null);
    expect(detector.infer()).toEqual({ type: 'string', nullable: true });
  });
});
```

#### Integration Tests (`tests/integration/`)
- Multi-package interactions: browser → core, core → server
- Use real Firecrawl sessions against **test fixture pages** (local HTML served by test server)
- Slower: 30-120s per test
- Require `FIRECRAWL_API_KEY` env var

```typescript
// Example: discovery-to-api.integration.test.ts
describe('Discovery → Workflow → API', () => {
  let fixtureServer: Server;
  
  beforeAll(async () => {
    fixtureServer = await startFixtureServer(3456); // serves test HTML pages
  });

  it('discovers a search form and generates a working API endpoint', async () => {
    const discovery = await discover('http://localhost:3456/search-form.html');
    expect(discovery.elements).toHaveLength(3);
    
    const workflow = await generateWorkflow(discovery);
    expect(workflow.steps).toHaveLength(5);
    
    const schema = await inferSchema(workflow);
    expect(schema.output.type).toBe('array');
  });
});
```

#### E2E Tests (`tests/e2e/`)
- Full CLI-to-API pipeline
- Run `fireapi init <url>` → `fireapi serve` → send HTTP request → verify response
- Run against real public pages (with caching to avoid flakiness)
- Slowest: 2-5 minutes for full suite
- Run in CI on merge to main only (not on every PR)

### Test Fixtures

Static HTML pages that simulate real-world forms for deterministic testing:

```
tests/fixtures/
├── simple-search.html       # Text input + submit → results table
├── dropdown-form.html       # Dropdowns with cascading options
├── paginated-results.html   # Results with numbered pagination
├── multi-step-form.html     # Multi-page wizard
├── data-table.html          # Complex table with sorting/filtering
└── dynamic-content.html     # JavaScript-rendered content
```

### Coverage Targets

| Package | Line Coverage Target |
|---|---|
| `@fireapi/core` | ≥ 85% |
| `@fireapi/browser` | ≥ 70% (browser interactions are harder to unit test) |
| `@fireapi/server` | ≥ 80% |
| `@fireapi/cli` | ≥ 60% (mostly thin wrappers) |
| `@fireapi/recorder` | ≥ 60% |
| `@fireapi/dashboard` | ≥ 50% (UI) |

---

## Logging & Observability

### Logger: Pino

[Pino](https://getpino.io) v9.x for structured JSON logging.

```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty', options: { colorize: true } } 
    : undefined,
});

// Usage
logger.info({ workflowId, step: 'navigate', url }, 'Executing step');
logger.error({ err, workflowId, sessionId }, 'Workflow execution failed');
logger.debug({ selectors, resolved: bestSelector }, 'Selector resolved');
```

### Log Levels by Context

| Context | Level |
|---|---|
| HTTP request/response | `info` |
| Workflow step execution | `debug` |
| Selector resolution | `debug` |
| Session lifecycle | `info` |
| Schema inference | `info` |
| Self-healing actions | `warn` |
| Errors | `error` |
| Discovery results | `info` |

### Structured Log Fields

Every log entry includes:
```json
{
  "level": "info",
  "time": 1709000000000,
  "msg": "Workflow executed",
  "workflowId": "property-search",
  "executionId": "01HY...",
  "sessionId": "550e8400-...",
  "durationMs": 4523,
  "stepCount": 7,
  "cached": false
}
```
