import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { type WorkflowGraph, WorkflowGraphValidator } from '../../src/index.js';

function loadWorkflowFixture(): WorkflowGraph {
  const raw = readFileSync(
    resolve(process.cwd(), 'tests/fixtures/workflows/basic-search.json'),
    'utf-8',
  );
  return JSON.parse(raw) as WorkflowGraph;
}

describe('WorkflowGraphValidator', () => {
  it('accepts a valid workflow graph', () => {
    const validator = new WorkflowGraphValidator();
    const workflow = loadWorkflowFixture();

    const result = validator.validate(workflow);
    expect(result.ok).toBe(true);
  });

  it('rejects duplicate step ids', () => {
    const validator = new WorkflowGraphValidator();
    const workflow = loadWorkflowFixture();
    const dupe = workflow.steps[0];
    if (!dupe) {
      throw new Error('Fixture missing first step');
    }
    workflow.steps.push({ ...dupe, config: { ...dupe.config } });

    const result = validator.validate(workflow);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details?.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'duplicate_step_id' })]),
      );
    }
  });

  it('rejects invalid loop path bounds', () => {
    const validator = new WorkflowGraphValidator();
    const workflow = loadWorkflowFixture();

    workflow.steps.push({
      id: 'loop-1',
      type: 'loop',
      config: {
        type: 'loop',
        maxIterations: 2,
        exitCondition: 'loop.iteration >= 1',
        bodyStartStepId: 'extract-1',
        bodyEndStepId: 'navigate-1',
      },
      selectors: [],
      timeout: 1000,
      retries: 0,
      onFailure: 'abort',
    });
    workflow.edges.push({ from: 'extract-1', to: 'loop-1' });

    const result = validator.validate(workflow);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details?.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'invalid_loop_path' })]),
      );
    }
  });
});
