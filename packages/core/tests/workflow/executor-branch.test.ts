import { describe, expect, it } from 'vitest';

import { WorkflowExecutor, type WorkflowGraph } from '../../src/index.js';
import { FakeRuntime } from '../fixtures/fake-runtime.js';

const branchWorkflow: WorkflowGraph = {
  version: 2,
  id: 'wf-branch',
  name: 'Branch Flow',
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
      id: 'branch-1',
      type: 'branch',
      config: {
        type: 'branch',
        condition: 'params.useAdvanced == true',
        trueStepId: 'fill-advanced',
        falseStepId: 'fill-basic',
      },
      selectors: [],
      timeout: 1000,
      retries: 0,
      onFailure: 'abort',
    },
    {
      id: 'fill-advanced',
      type: 'fill',
      config: { type: 'fill', parameterRef: 'query' },
      selectors: [{ type: 'css', value: '#advanced', confidence: 1 }],
      timeout: 1000,
      retries: 0,
      onFailure: 'abort',
    },
    {
      id: 'fill-basic',
      type: 'fill',
      config: { type: 'fill', parameterRef: 'query' },
      selectors: [{ type: 'css', value: '#basic', confidence: 1 }],
      timeout: 1000,
      retries: 0,
      onFailure: 'abort',
    },
    {
      id: 'extract-1',
      type: 'extract',
      config: { type: 'extract', target: 'resultText', extractionType: 'text' },
      selectors: [{ type: 'css', value: '#result', confidence: 1 }],
      timeout: 1000,
      retries: 0,
      onFailure: 'abort',
    },
  ],
  edges: [
    { from: 'navigate-1', to: 'branch-1' },
    { from: 'branch-1', to: 'fill-advanced' },
    { from: 'branch-1', to: 'fill-basic' },
    { from: 'fill-advanced', to: 'extract-1' },
    { from: 'fill-basic', to: 'extract-1' },
  ],
  inputParameters: [
    {
      name: 'query',
      type: 'string',
      required: true,
      description: 'Query',
      linkedStepId: 'fill-basic',
    },
    {
      name: 'useAdvanced',
      type: 'boolean',
      required: true,
      description: 'Branch toggle',
      linkedStepId: 'branch-1',
    },
  ],
  extractionTargets: [
    {
      name: 'resultText',
      type: 'scalar',
      schema: {},
      linkedStepId: 'extract-1',
    },
  ],
};

describe('WorkflowExecutor (branch)', () => {
  it('follows true branch', async () => {
    const executor = new WorkflowExecutor();
    const runtime = new FakeRuntime();

    const result = await executor.execute(
      branchWorkflow,
      { query: 'x', useAdvanced: true },
      runtime,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const filledAdvanced = runtime.calls.some(
        (call) => call.method === 'fill' && JSON.stringify(call.args).includes('#advanced'),
      );
      const filledBasic = runtime.calls.some(
        (call) => call.method === 'fill' && JSON.stringify(call.args).includes('#basic'),
      );
      expect(filledAdvanced).toBe(true);
      expect(filledBasic).toBe(false);
    }
  });

  it('follows false branch', async () => {
    const executor = new WorkflowExecutor();
    const runtime = new FakeRuntime();

    const result = await executor.execute(
      branchWorkflow,
      { query: 'x', useAdvanced: false },
      runtime,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const filledBasic = runtime.calls.some(
        (call) => call.method === 'fill' && JSON.stringify(call.args).includes('#basic'),
      );
      expect(filledBasic).toBe(true);
    }
  });
});
