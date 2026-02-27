import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type WorkflowGraph, WorkflowPlanner } from '../../src/index.js';

function loadWorkflowFixture(): WorkflowGraph {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'tests/fixtures/workflows/basic-search.json'), 'utf-8'),
  ) as WorkflowGraph;
}

describe('WorkflowPlanner', () => {
  it('builds deterministic topological order', () => {
    const planner = new WorkflowPlanner();
    const workflow = loadWorkflowFixture();

    const planA = planner.build(workflow);
    const planB = planner.build(workflow);

    expect(planA.ok).toBe(true);
    expect(planB.ok).toBe(true);
    if (planA.ok && planB.ok) {
      expect(planA.data.topologicalOrder).toEqual(planB.data.topologicalOrder);
      expect(planA.data.entryStepId).toBe('navigate-1');
    }
  });

  it('fails for cyclic graph', () => {
    const planner = new WorkflowPlanner();
    const workflow = loadWorkflowFixture();
    workflow.edges.push({ from: 'extract-1', to: 'navigate-1' });

    const plan = planner.build(workflow);
    expect(plan.ok).toBe(false);
  });
});
