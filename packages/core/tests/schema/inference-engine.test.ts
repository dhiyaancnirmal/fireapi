import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SchemaInferenceEngine, type WorkflowGraph } from '../../src/index.js';
import { FakeRuntime } from '../fixtures/fake-runtime.js';

function loadWorkflowFixture(): WorkflowGraph {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'tests/fixtures/workflows/basic-search.json'), 'utf-8'),
  ) as WorkflowGraph;
}

describe('SchemaInferenceEngine', () => {
  it('infers input/output schema from successful sample executions', async () => {
    const engine = new SchemaInferenceEngine();
    const graph = loadWorkflowFixture();

    const result = await engine.inferFromWorkflow(graph, () => new FakeRuntime(), {
      sampleInputs: [{ query: 'books' }, { query: 'music' }],
      includeExamples: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.inputSchema.kind).toBe('object');
      expect(result.data.outputSchema.kind).toBe('object');
      expect(result.data.sampleRuns.filter((run) => run.success)).toHaveLength(2);
    }
  });

  it('fails when too many sample runs fail', async () => {
    const engine = new SchemaInferenceEngine();
    const graph = loadWorkflowFixture();

    const result = await engine.inferFromWorkflow(
      graph,
      () => new FakeRuntime({ shouldFail: { navigate: 'boom' } }),
      {
        sampleInputs: [{ query: 'a' }, { query: 'b' }],
      },
    );

    expect(result.ok).toBe(false);
  });
});
