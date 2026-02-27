import { describe, expect, it } from 'vitest';

import { WorkflowExecutor, type WorkflowGraph } from '../../src/index.js';
import { FakeRuntime } from '../fixtures/fake-runtime.js';

function buildLoopWorkflow(maxIterations = 3): WorkflowGraph {
  return {
    version: 2,
    id: 'wf-loop',
    name: 'Loop Flow',
    sourceUrl: 'https://example.com',
    steps: [
      {
        id: 'navigate-1',
        type: 'navigate',
        config: { type: 'navigate', url: 'https://example.com' },
        selectors: [],
        timeout: 1000,
        retries: 0,
        onFailure: 'abort',
      },
      {
        id: 'loop-1',
        type: 'loop',
        config: {
          type: 'loop',
          maxIterations,
          exitCondition: 'loop.iteration >= 2',
          bodyStartStepId: 'extract-page',
          bodyEndStepId: 'extract-page',
          continueStepId: 'assert-1',
        },
        selectors: [],
        timeout: 1000,
        retries: 0,
        onFailure: 'abort',
      },
      {
        id: 'extract-page',
        type: 'extract',
        config: {
          type: 'extract',
          target: 'items',
          extractionType: 'list',
          listItemSelector: '.item',
          listItemMode: 'text',
          append: true,
        },
        selectors: [{ type: 'css', value: '#list', confidence: 1 }],
        timeout: 1000,
        retries: 0,
        onFailure: 'abort',
      },
      {
        id: 'assert-1',
        type: 'assert',
        config: {
          type: 'assert',
          leftRef: 'extract.items',
          operator: 'contains',
          expected: 'a',
        },
        selectors: [],
        timeout: 1000,
        retries: 0,
        onFailure: 'abort',
      },
    ],
    edges: [
      { from: 'navigate-1', to: 'loop-1' },
      { from: 'loop-1', to: 'extract-page' },
      { from: 'loop-1', to: 'assert-1' },
    ],
    inputParameters: [],
    extractionTargets: [
      {
        name: 'items',
        type: 'array',
        schema: {},
        linkedStepId: 'extract-page',
      },
    ],
  };
}

describe('WorkflowExecutor (loop)', () => {
  it('iterates loop body and appends extraction output', async () => {
    const executor = new WorkflowExecutor();
    const runtime = new FakeRuntime();

    const result = await executor.execute(buildLoopWorkflow(), {}, runtime);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.context.steps['extract-page']?.status).toBe('success');
      expect(result.data.data.items).toEqual(['a', 'b', 'a', 'b']);
      expect(result.data.context.assertions[0]?.passed).toBe(true);
    }
  });

  it('fails when maxIterations is exceeded', async () => {
    const executor = new WorkflowExecutor();
    const runtime = new FakeRuntime();

    const result = await executor.execute(buildLoopWorkflow(1), {}, runtime);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('maxIterations');
    }
  });
});
