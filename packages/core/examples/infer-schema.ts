import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SchemaInferenceEngine, type WorkflowGraph } from '../src/index.js';
import { FakeRuntime } from '../tests/fixtures/fake-runtime.js';

const workflowPath = resolve(process.cwd(), 'tests/fixtures/workflows/basic-search.json');
const workflow = JSON.parse(readFileSync(workflowPath, 'utf-8')) as WorkflowGraph;

const engine = new SchemaInferenceEngine();
const inferred = await engine.inferFromWorkflow(workflow, () => new FakeRuntime(), {
  sampleInputs: [{ query: 'books' }, { query: 'games' }],
  includeExamples: true,
});

if (!inferred.ok) {
  throw inferred.error;
}

console.log(JSON.stringify(inferred.data.generated.outputJsonSchema, null, 2));
