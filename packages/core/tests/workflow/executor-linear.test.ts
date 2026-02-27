import { describe, expect, it } from 'vitest';

import { WorkflowExecutor, type WorkflowGraph } from '../../src/index.js';
import { FakeRuntime } from '../fixtures/fake-runtime.js';

function buildLinearWorkflow(onFillFailure: 'abort' | 'skip' = 'abort'): WorkflowGraph {
  return {
    version: 2,
    id: 'wf-linear',
    name: 'Linear',
    sourceUrl: 'https://example.com',
    steps: [
      {
        id: 'navigate-1',
        type: 'navigate',
        config: { type: 'navigate', url: 'https://example.com/search?q={{query}}' },
        selectors: [],
        timeout: 1000,
        retries: 0,
        onFailure: 'abort',
      },
      {
        id: 'fill-1',
        type: 'fill',
        config: { type: 'fill', parameterRef: 'query' },
        selectors: [{ type: 'css', value: '#query', confidence: 1 }],
        timeout: 1000,
        retries: 1,
        onFailure: onFillFailure,
      },
      {
        id: 'click-1',
        type: 'click',
        config: { type: 'click' },
        selectors: [{ type: 'css', value: 'button', confidence: 1 }],
        timeout: 1000,
        retries: 0,
        onFailure: 'abort',
      },
      {
        id: 'extract-1',
        type: 'extract',
        config: { type: 'extract', target: 'results', extractionType: 'table' },
        selectors: [{ type: 'css', value: 'table', confidence: 1 }],
        timeout: 1000,
        retries: 0,
        onFailure: 'abort',
      },
    ],
    edges: [
      { from: 'navigate-1', to: 'fill-1' },
      { from: 'fill-1', to: 'click-1' },
      { from: 'click-1', to: 'extract-1' },
    ],
    inputParameters: [
      {
        name: 'query',
        type: 'string',
        required: true,
        description: 'Query',
        linkedStepId: 'fill-1',
      },
    ],
    extractionTargets: [
      {
        name: 'results',
        type: 'table',
        schema: {},
        linkedStepId: 'extract-1',
      },
    ],
  };
}

describe('WorkflowExecutor (linear)', () => {
  it('executes a linear workflow', async () => {
    const executor = new WorkflowExecutor();
    const runtime = new FakeRuntime();

    const result = await executor.execute(buildLinearWorkflow(), { query: 'books' }, runtime);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.success).toBe(true);
      expect(result.data.data.results).toEqual(expect.objectContaining({ rowCount: 1 }));
      expect(runtime.calls.map((call) => call.method)).toContain('fill');
      expect(runtime.closed).toBe(1);
    }
  });

  it('continues when step fails with onFailure=skip', async () => {
    const executor = new WorkflowExecutor();
    const runtime = new FakeRuntime({ shouldFail: { fill: 'fill failed' } });

    const result = await executor.execute(buildLinearWorkflow('skip'), { query: 'books' }, runtime);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.context.steps['fill-1']?.status).toBe('skipped');
      expect(result.data.context.steps['extract-1']?.status).toBe('success');
    }
  });
});
