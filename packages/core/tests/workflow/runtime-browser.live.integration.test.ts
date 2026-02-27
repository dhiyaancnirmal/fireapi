import { describe, expect, it } from 'vitest';

import { FirecrawlSessionManager } from '@fireapi/browser';

import { BrowserWorkflowRuntime, WorkflowExecutor, type WorkflowGraph } from '../../src/index.js';

describe.skipIf(!process.env.FIRECRAWL_API_KEY)('BrowserWorkflowRuntime live integration', () => {
  it('executes a simple workflow against a public page', { timeout: 120000 }, async () => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new Error('FIRECRAWL_API_KEY missing');
    }

    const manager = new FirecrawlSessionManager({
      apiKey,
      maxConcurrentSessions: 1,
      warmPoolSize: 0,
      sessionTtlSeconds: 180,
      activityTtlSeconds: 90,
      maxUsesPerSession: 20,
      acquireTimeoutMs: 15000,
      maxQueueSize: 5,
    });

    const runtime = new BrowserWorkflowRuntime({ sessionManager: manager });
    const executor = new WorkflowExecutor();

    const workflow: WorkflowGraph = {
      version: 2,
      id: 'wf-live-browser-runtime',
      name: 'Live Browser Runtime',
      sourceUrl: 'https://example.com/',
      steps: [
        {
          id: 'navigate-1',
          type: 'navigate',
          config: { type: 'navigate', url: 'https://example.com/' },
          selectors: [],
          timeout: 20000,
          retries: 0,
          onFailure: 'abort',
        },
        {
          id: 'extract-1',
          type: 'extract',
          config: { type: 'extract', target: 'heading', extractionType: 'text' },
          selectors: [{ type: 'css', value: 'h1', confidence: 1 }],
          timeout: 10000,
          retries: 0,
          onFailure: 'abort',
        },
      ],
      edges: [{ from: 'navigate-1', to: 'extract-1' }],
      inputParameters: [],
      extractionTargets: [
        { name: 'heading', type: 'scalar', schema: {}, linkedStepId: 'extract-1' },
      ],
    };

    try {
      const result = await executor.execute(workflow, {}, runtime);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(
          typeof result.data.data.heading === 'string' || result.data.data.heading === null,
        ).toBe(true);
      }
    } finally {
      await runtime.close();
      await manager.destroyAll();
    }
  });
});
