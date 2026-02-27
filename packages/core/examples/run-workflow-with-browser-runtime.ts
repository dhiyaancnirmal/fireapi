import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { FirecrawlSessionManager } from '@fireapi/browser';

import { BrowserWorkflowRuntime, WorkflowExecutor, type WorkflowGraph } from '../src/index.js';

const apiKey = process.env.FIRECRAWL_API_KEY;
if (!apiKey) {
  throw new Error('FIRECRAWL_API_KEY is required');
}

const workflowPath = resolve(process.cwd(), 'tests/fixtures/workflows/basic-search.json');
const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8')) as WorkflowGraph;

const sessionManager = new FirecrawlSessionManager({
  apiKey,
  maxConcurrentSessions: 1,
  warmPoolSize: 0,
  sessionTtlSeconds: 180,
  activityTtlSeconds: 90,
  maxUsesPerSession: 20,
  acquireTimeoutMs: 10000,
  maxQueueSize: 10,
});

const runtime = new BrowserWorkflowRuntime({ sessionManager });
const executor = new WorkflowExecutor();

try {
  const result = await executor.execute(workflow, { query: 'firecrawl' }, runtime);
  if (!result.ok) {
    throw result.error;
  }
  console.log(JSON.stringify(result.data.data, null, 2));
} finally {
  await runtime.close();
  await sessionManager.destroyAll();
}
