import type { Result } from '@fireapi/browser';
import { WorkflowValidationError } from '../errors.js';
import type { WorkflowEdge, WorkflowGraph, WorkflowPlan, WorkflowStep } from './types.js';

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

export class WorkflowPlanner {
  build(graph: WorkflowGraph): Result<WorkflowPlan, WorkflowValidationError> {
    const stepById: Record<string, WorkflowStep> = {};
    const outgoingByStepId: Record<string, string[]> = {};
    const incomingByStepId: Record<string, string[]> = {};

    for (const step of graph.steps) {
      stepById[step.id] = step;
      outgoingByStepId[step.id] = [];
      incomingByStepId[step.id] = [];
    }

    for (const edge of graph.edges) {
      if (!stepById[edge.from] || !stepById[edge.to]) {
        return {
          ok: false,
          error: new WorkflowValidationError('Planner encountered edge with unknown step ID', {
            edge,
          }),
        };
      }
      const outgoing = outgoingByStepId[edge.from];
      const incoming = incomingByStepId[edge.to];
      if (!outgoing || !incoming) {
        return {
          ok: false,
          error: new WorkflowValidationError('Planner encountered missing adjacency bucket', {
            edge,
          }),
        };
      }
      outgoing.push(edge.to);
      incoming.push(edge.from);
    }

    for (const key of Object.keys(outgoingByStepId)) {
      outgoingByStepId[key] = sortIds(outgoingByStepId[key] ?? []);
    }
    for (const key of Object.keys(incomingByStepId)) {
      incomingByStepId[key] = sortIds(incomingByStepId[key] ?? []);
    }

    const roots = graph.steps
      .map((step) => step.id)
      .filter((stepId) => (incomingByStepId[stepId]?.length ?? 0) === 0)
      .sort((a, b) => a.localeCompare(b));

    if (roots.length !== 1) {
      return {
        ok: false,
        error: new WorkflowValidationError('Workflow graph must have exactly one entry step', {
          rootStepIds: roots,
        }),
      };
    }
    const entryStepId = roots[0];
    if (!entryStepId) {
      return {
        ok: false,
        error: new WorkflowValidationError(
          'Workflow graph is missing an entry step after validation',
        ),
      };
    }

    const topologicalOrder = topologicalSort(graph.steps, graph.edges);
    if (!topologicalOrder.ok) {
      return topologicalOrder;
    }

    return {
      ok: true,
      data: {
        entryStepId,
        topologicalOrder: topologicalOrder.data,
        outgoingByStepId,
        incomingByStepId,
        stepById,
      },
    };
  }
}

function topologicalSort(
  steps: WorkflowStep[],
  edges: WorkflowEdge[],
): Result<string[], WorkflowValidationError> {
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const stepIds = steps.map((step) => step.id);

  for (const id of stepIds) {
    indegree.set(id, 0);
    outgoing.set(id, []);
  }

  for (const edge of edges) {
    outgoing.get(edge.from)?.push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  for (const [id, list] of outgoing) {
    outgoing.set(
      id,
      list.sort((a, b) => a.localeCompare(b)),
    );
  }

  const queue = [...stepIds]
    .filter((id) => (indegree.get(id) ?? 0) === 0)
    .sort((a, b) => a.localeCompare(b));
  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    result.push(current);
    for (const next of outgoing.get(current) ?? []) {
      const nextDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) {
        queue.push(next);
        queue.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  if (result.length !== stepIds.length) {
    return {
      ok: false,
      error: new WorkflowValidationError('Workflow graph contains a cycle', {
        stepCount: stepIds.length,
        sortedCount: result.length,
      }),
    };
  }

  return { ok: true, data: result };
}
