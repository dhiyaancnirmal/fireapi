# 03 — Data Modeling & Storage

## Database: SQLite via better-sqlite3 + Drizzle ORM

SQLite is the right choice for a self-hosted CLI tool: zero configuration, single-file database, no daemon process, portable, and fast for the read/write patterns this tool needs. [Drizzle ORM](https://orm.drizzle.team/docs/get-started-sqlite) provides type-safe queries with minimal overhead.

```
npm install drizzle-orm better-sqlite3
npm install -D drizzle-kit @types/better-sqlite3
```

### Database Location
- Default: `~/.fireapi/fireapi.db` (user home directory)
- Configurable via `FIREAPI_DB_PATH` env var or `--db` CLI flag
- Project-local: `./fireapi.db` when `fireapi init` is run in a directory

---

## Schema Design

### Core Tables

#### `workflows`
The central entity. Each workflow represents a repeatable web interaction that maps to a REST endpoint.

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const workflows = sqliteTable('workflows', {
  id:            text('id').primaryKey(),                    // ULID
  name:          text('name').notNull(),                     // human-readable, URL-safe
  description:   text('description'),                       // optional description
  sourceUrl:     text('source_url').notNull(),               // target website URL
  endpointPath:  text('endpoint_path').notNull().unique(),   // e.g. "/api/property-search"
  httpMethod:    text('http_method').notNull().default('GET'),// GET | POST
  graphJson:     text('graph_json').notNull(),               // serialized WorkflowGraph DAG
  graphVersion:  integer('graph_version').notNull().default(1),
  inputSchema:   text('input_schema'),                       // JSON Schema string
  outputSchema:  text('output_schema'),                      // JSON Schema string
  inputZod:      text('input_zod'),                          // Zod schema source (for codegen)
  outputZod:     text('output_zod'),                         // Zod schema source (for codegen)
  cacheTtl:      integer('cache_ttl').default(0),            // seconds, 0 = no cache
  status:        text('status').notNull().default('active'), // active | degraded | broken | disabled
  createdAt:     text('created_at').notNull(),               // ISO 8601
  updatedAt:     text('updated_at').notNull(),               // ISO 8601
});
```

#### `discovery_results`
Stores the raw output of page discovery for reference and diff.

```typescript
export const discoveryResults = sqliteTable('discovery_results', {
  id:           text('id').primaryKey(),             // ULID
  url:          text('url').notNull(),
  elementsJson: text('elements_json').notNull(),     // serialized DiscoveryResult
  discoveredAt: text('discovered_at').notNull(),
  workflowId:   text('workflow_id').references(() => workflows.id),
});
```

#### `executions`
Every API call execution is logged for debugging and monitoring.

```typescript
export const executions = sqliteTable('executions', {
  id:           text('id').primaryKey(),             // ULID
  workflowId:   text('workflow_id').notNull().references(() => workflows.id),
  inputParams:  text('input_params').notNull(),      // JSON string of request params
  outputData:   text('output_data'),                 // JSON string of response body
  status:       text('status').notNull(),            // success | failed | timeout | healing
  errorMessage: text('error_message'),
  failedStep:   text('failed_step'),                 // step ID where failure occurred
  durationMs:   integer('duration_ms').notNull(),
  sessionId:    text('session_id'),                  // Firecrawl session ID
  executedAt:   text('executed_at').notNull(),
});
```

#### `health_checks`
Records from the self-healing monitoring daemon.

```typescript
export const healthChecks = sqliteTable('health_checks', {
  id:           text('id').primaryKey(),
  workflowId:   text('workflow_id').notNull().references(() => workflows.id),
  status:       text('status').notNull(),            // passed | degraded | failed | healed
  baselineHash: text('baseline_hash'),               // hash of expected output schema
  resultHash:   text('result_hash'),                 // hash of actual output
  selectorChanges: text('selector_changes'),         // JSON: which selectors were updated
  checkedAt:    text('checked_at').notNull(),
});
```

#### `workflow_changelog`
Tracks all modifications to workflows for auditability.

```typescript
export const workflowChangelog = sqliteTable('workflow_changelog', {
  id:          text('id').primaryKey(),
  workflowId:  text('workflow_id').notNull().references(() => workflows.id),
  changeType:  text('change_type').notNull(),        // created | updated | healed | broken | schema_changed
  diff:        text('diff'),                         // JSON diff of what changed
  source:      text('source').notNull(),             // user | auto_heal | discovery
  changedAt:   text('changed_at').notNull(),
});
```

---

## Key Data Structures (In-Memory / JSON)

### DiscoveryResult

```typescript
interface DiscoveryResult {
  url: string;
  timestamp: string;
  elements: DiscoveredElement[];
  tables: DiscoveredTable[];
  forms: DiscoveredForm[];
  paginationControls: PaginationControl[];
  dependencies: FormDependency[];
}

interface DiscoveredElement {
  id: string;                           // generated unique ID
  type: 'text_input' | 'select' | 'checkbox' | 'radio' | 'date_picker' | 
        'file_upload' | 'textarea' | 'button' | 'submit' | 'search';
  name: string | null;
  label: string | null;                 // associated <label> text
  placeholder: string | null;
  ariaLabel: string | null;
  selectors: SelectorStrategy[];        // multiple selector approaches
  options?: SelectOption[];             // for <select> elements
  required: boolean;
  formId: string | null;                // parent <form> id if any
}

interface SelectorStrategy {
  type: 'css' | 'xpath' | 'aria' | 'text' | 'position';
  value: string;
  confidence: number;                   // 0-1, how likely to survive DOM changes
}

interface DiscoveredTable {
  selectors: SelectorStrategy[];
  headers: string[];
  columnTypes: ('string' | 'number' | 'date' | 'boolean' | 'url' | 'unknown')[];
  sampleRows: Record<string, string>[];
  rowCount: number;
  hasPagination: boolean;
}

interface FormDependency {
  sourceElement: string;                // element ID
  targetElement: string;                // element ID
  type: 'cascading_options' | 'visibility_toggle' | 'value_constraint';
  observedValues: Record<string, string[]>;  // source value → target options
}
```

### WorkflowGraph

```typescript
interface WorkflowGraph {
  version: number;                      // schema version for forward compat
  id: string;
  name: string;
  sourceUrl: string;
  steps: WorkflowStep[];
  edges: WorkflowEdge[];               // step connections forming DAG
  inputParameters: InputParameter[];
  extractionTargets: ExtractionTarget[];
}

interface WorkflowStep {
  id: string;
  type: 'navigate' | 'fill' | 'select' | 'click' | 'wait' | 
        'extract' | 'assert' | 'branch' | 'loop';
  config: StepConfig;                   // type-specific configuration
  selectors: SelectorStrategy[];        // multiple fallback selectors
  timeout: number;                      // ms
  retries: number;
  onFailure: 'abort' | 'skip' | 'fallback_selector';
}

// Example StepConfig union
type StepConfig = 
  | { type: 'navigate'; url: string }
  | { type: 'fill'; parameterRef: string; defaultValue?: string }
  | { type: 'select'; parameterRef: string; optionMapping?: Record<string, string> }
  | { type: 'click' }
  | { type: 'wait'; condition: 'selector' | 'networkidle' | 'timeout'; value: string | number }
  | { type: 'extract'; target: string; extractionType: 'text' | 'attribute' | 'table' | 'list' }
  | { type: 'assert'; expected: string; operator: 'contains' | 'equals' | 'exists' }
  | { type: 'branch'; condition: string; trueStepId: string; falseStepId: string }
  | { type: 'loop'; maxIterations: number; exitCondition: string };

interface WorkflowEdge {
  from: string;                         // step ID
  to: string;                           // step ID
  condition?: string;                   // optional branch condition
}

interface InputParameter {
  name: string;                         // URL-safe parameter name
  type: 'string' | 'number' | 'boolean' | 'enum';
  required: boolean;
  description: string;
  enumValues?: string[];                // from <select> options
  defaultValue?: string;
  linkedStepId: string;                 // which step uses this param
}

interface ExtractionTarget {
  name: string;
  type: 'scalar' | 'array' | 'table';
  schema: Record<string, any>;         // JSON Schema for this target
  linkedStepId: string;
}
```

---

## Migrations Strategy

- **Drizzle Kit** for migration generation: `npx drizzle-kit generate`
- Migrations stored in `drizzle/migrations/` directory
- Applied automatically on startup via `drizzle-kit migrate`
- SQLite WAL mode enabled for concurrent read performance
- Schema versioned alongside code — no separate migration service needed

## Indexing

```sql
CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_workflows_endpoint ON workflows(endpoint_path);
CREATE INDEX idx_executions_workflow ON executions(workflow_id);
CREATE INDEX idx_executions_status ON executions(status);
CREATE INDEX idx_executions_date ON executions(executed_at);
CREATE INDEX idx_health_checks_workflow ON health_checks(workflow_id);
CREATE INDEX idx_health_checks_date ON health_checks(checked_at);
```

## Data Lifecycle

| Data | Retention | Cleanup Strategy |
|---|---|---|
| Workflows | Permanent until deleted | User-managed |
| Discovery results | Keep latest 5 per URL | Prune on new discovery |
| Executions | 30 days default | Configurable, auto-pruned |
| Health checks | 90 days | Auto-pruned |
| Changelog | Permanent | Append-only |
| Cache entries | TTL-based | Auto-evicted |
