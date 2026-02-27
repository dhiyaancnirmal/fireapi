# 09 — UI/UX, Dashboard, State Management & Accessibility

## CLI UX

The CLI is the primary interface. It must feel fast, informative, and visually clear.

### Design Principles
- **Progressive disclosure**: show summary first, details on `--verbose`
- **Colored output**: green for success, red for errors, yellow for warnings, cyan for info
- **Spinners for long operations**: `ora` spinners with step descriptions
- **Tables for structured data**: formatted ASCII tables for discovery results
- **Exit codes**: 0 success, 1 validation error, 2 runtime error, 3 configuration error

### CLI Output Examples

**Discovery:**
```
$ fireapi discover https://county-records.gov/search

🔍 Discovering interactive elements...

┌─────────────────────────────────────────────────────────────────┐
│ Discovery Results: https://county-records.gov/search            │
├──────────────┬──────────┬──────────────────────────────────────┤
│ Element      │ Type     │ Details                              │
├──────────────┼──────────┼──────────────────────────────────────┤
│ Owner Name   │ text     │ input[name="owner"]                  │
│ Address      │ text     │ input[name="address"]                │
│ Parcel ID    │ text     │ input[name="parcel_id"]              │
│ County       │ select   │ 4 options: harris, dallas, ...       │
│ Property Type│ select   │ 4 options: residential, ...          │
│ Search       │ submit   │ button[type="submit"]                │
├──────────────┼──────────┼──────────────────────────────────────┤
│ Results Table│ table    │ 8 columns, paginated                 │
└──────────────┴──────────┴──────────────────────────────────────┘

Found: 5 inputs, 1 submit, 1 data table, 0 dependencies
```

**Serve:**
```
$ fireapi serve

🚀 FireAPI Server

   Local:    http://localhost:3000
   Docs:     http://localhost:3000/docs
   OpenAPI:  http://localhost:3000/openapi.json

   Workflows:
   ├── GET /api/property-search  ✅ active  (cached: 5min)
   ├── GET /api/business-lookup  ✅ active  (cached: 1min)
   └── GET /api/court-records    ⚠️ degraded (1 selector healed)

   Press Ctrl+C to stop
```

---

## Dashboard UI

### Tech Stack
- **React 19** with TypeScript
- **Tailwind CSS v4** for styling
- **@tanstack/react-query v5** for server state
- **react-router v7** for client-side routing
- **lucide-react** for icons
- Served as static files by the Hono server at `/dashboard`

### Pages

| Route | Page | Description |
|---|---|---|
| `/dashboard` | Overview | Workflow health summary, recent executions, system stats |
| `/dashboard/workflows` | Workflow List | All workflows with status, last execution, actions |
| `/dashboard/workflows/:id` | Workflow Detail | Graph visualization, schema explorer, execution history |
| `/dashboard/workflows/:id/edit` | Workflow Editor | Visual step editor, selector management |
| `/dashboard/workflows/:id/live` | Live Execution | Embedded Firecrawl Live View + execution logs |
| `/dashboard/executions` | Execution Log | Searchable list of all executions |
| `/dashboard/executions/:id` | Execution Detail | Full request/response, step timings, errors |
| `/dashboard/discover` | Discovery Tool | URL input → run discovery → review results |
| `/dashboard/settings` | Settings | Configuration, Firecrawl key status, database stats |

### State Management

**Server State: @tanstack/react-query**
- All data fetched from the FireAPI (same server)
- Automatic cache invalidation on mutations
- Polling for live data (execution status, health checks)

**Client State: React useState/useReducer**
- Workflow editor state (drag positions, selected step)
- UI state (modals, sidebars, filters)
- No Redux, no Zustand — the app is simple enough

```typescript
// Example: Workflow list with real-time health updates
function useWorkflows() {
  return useQuery({
    queryKey: ['workflows'],
    queryFn: () => fetch('/api/_workflows').then(r => r.json()),
    refetchInterval: 30_000, // poll every 30s for health updates
  });
}

function useWorkflowExecution(workflowId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (params: Record<string, string>) =>
      fetch(`/api/_workflows/${workflowId}/test`, {
        method: 'POST',
        body: JSON.stringify(params),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executions'] });
    },
  });
}
```

### Visual Workflow Editor

The workflow editor renders the DAG as a visual flow:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Navigate    │────→│  Fill Form  │────→│  Click      │
│  county.gov  │     │  (3 fields) │     │  Submit     │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
                                         ┌──────▼──────┐
                                         │  Wait for   │
                                         │  Results    │
                                         └──────┬──────┘
                                                │
                                         ┌──────▼──────┐
                                         │  Extract    │
                                         │  Table Data │
                                         └─────────────┘
```

Implementation: SVG-based with drag handles, rendered from the workflow graph JSON. No heavy libraries — custom lightweight renderer.

### Live Execution Viewer

Embeds Firecrawl's Live View URL in an iframe:
```typescript
<iframe
  src={execution.liveViewUrl}
  style={{ width: '100%', height: '600px', border: 'none' }}
  sandbox="allow-scripts allow-same-origin"
/>
```

Alongside the iframe, show:
- Step progress indicator (which step is currently executing)
- Real-time log stream
- Timing per step

---

## Accessibility

### Dashboard Accessibility Standards
- **WCAG 2.1 Level AA** compliance target
- Keyboard navigation for all interactive elements
- ARIA labels on all custom components
- Focus management for modals and drawers
- Color contrast ratio ≥ 4.5:1 for text
- Screen reader support via semantic HTML
- Reduced motion support via `prefers-reduced-motion`

### CLI Accessibility
- All output works without color (respects `NO_COLOR` env var)
- Structured output available via `--json` flag for screen reader / piping
- No ASCII art that breaks screen readers
- Error messages are descriptive without relying on color alone

```typescript
// Respect NO_COLOR standard
import chalk from 'chalk';
if (process.env.NO_COLOR) {
  chalk.level = 0;
}
```

---

## Internationalization

Not a priority for v1 (English-only). However, the architecture supports i18n readiness:

- All user-facing strings in CLI are extracted to a constants file
- Dashboard uses React's context-based i18n pattern (no i18n library yet)
- Database stores timestamps in ISO 8601 UTC
- No hardcoded date/number formats — use `Intl` APIs

Adding i18n later requires:
1. Install `react-i18next` for dashboard
2. Create locale JSON files
3. Wrap CLI strings in a `t()` function
4. No architectural changes needed
