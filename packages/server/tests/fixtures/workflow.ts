import type { WorkflowGraph } from '@fireapi/core';

export function createValidWorkflow(id = 'wf-test'): WorkflowGraph {
  return {
    version: 2,
    id,
    name: 'Test Workflow',
    sourceUrl: 'https://example.com',
    steps: [
      {
        id: 'assert-1',
        type: 'assert',
        config: {
          type: 'assert',
          leftRef: 'params.query',
          operator: 'exists',
        },
        selectors: [],
        timeout: 1000,
        retries: 0,
        onFailure: 'abort',
      },
    ],
    edges: [],
    inputParameters: [
      {
        name: 'query',
        type: 'string',
        required: true,
        description: 'Search query',
        linkedStepId: 'assert-1',
      },
    ],
    extractionTargets: [],
  };
}

export function createInvalidWorkflow(): WorkflowGraph {
  const graph = createValidWorkflow('wf-invalid');
  graph.steps = [];
  return graph;
}
