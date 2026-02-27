# @fireapi/core

Milestone 2 + 3 package for FireAPI workflow execution and deterministic schema inference.

## What this package provides

- Versioned workflow graph types (`version: 2`) with branch + loop meta-config
- Graph validation and deterministic planning
- Safe condition parser/evaluator (no `eval`)
- Workflow executor for all step types:
  - `navigate`, `fill`, `select`, `click`, `wait`, `extract`, `assert`, `branch`, `loop`
- Browser runtime adapter backed by `@fireapi/browser`
- Workflow serializer (`parse`, `stringify`, `diff`)
- Auto-workflow generation from `DiscoveryResult`
- Schema inference from sample workflow executions
- Runtime Zod schema + JSON Schema generation

## Install and build

From workspace root:

```bash
pnpm install
pnpm --filter @fireapi/core build
pnpm --filter @fireapi/core typecheck
pnpm --filter @fireapi/core test -- --run
```

## Workflow schema notes

- Graphs remain acyclic; loops are represented by `loop` step meta-config.
- `LoopStepConfig` fields:
  - `bodyStartStepId`
  - `bodyEndStepId`
  - `maxIterations`
  - `exitCondition`
  - optional `continueStepId`

## Condition DSL

Supported references:

- `params.<name>`
- `extract.<target>`
- `steps.<stepId>.status`
- `steps.<stepId>.output`
- `loop.iteration`

Supported operators:

- `==`, `!=`, `>`, `>=`, `<`, `<=`
- `contains`, `in`, `exists`
- `&&`, `||`
- parentheses

## Examples

- `/Users/dhiyaan/Code/newprojectforfirecrawl/packages/core/examples/generate-from-discovery.ts`
- `/Users/dhiyaan/Code/newprojectforfirecrawl/packages/core/examples/infer-schema.ts`
- `/Users/dhiyaan/Code/newprojectforfirecrawl/packages/core/examples/run-workflow-with-browser-runtime.ts`

## Known limitations

- Loop body semantics are deterministic but assume valid body bounds/paths from validator.
- Schema inference targets deterministic table/JSON-ish outputs; advanced heterogeneous unions are deferred.
- Auto-generation warns on pagination but does not emit pagination loops automatically.
