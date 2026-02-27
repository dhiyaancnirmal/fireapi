import { describe, expect, it } from 'vitest';

import { RecorderService } from '../src/recorder-service.js';
import type { RecorderActionRecord, RecorderSessionRecord } from '../src/types.js';
import { WorkflowDraftBuilder } from '../src/workflow-draft-builder.js';

function sessionFixture(): RecorderSessionRecord {
  const now = new Date().toISOString();
  return {
    id: 'rec-session-1',
    name: 'County Search',
    status: 'active',
    startUrl: 'https://example.com/search',
    currentUrl: 'https://example.com/search',
    firecrawlSessionId: 'fc-session',
    liveViewUrl: 'https://liveview.example.com/fc-session',
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  };
}

function actionsFixture(): RecorderActionRecord[] {
  const now = new Date().toISOString();
  return [
    {
      id: 1,
      sessionId: 'rec-session-1',
      seq: 1,
      type: 'fill',
      input: {
        type: 'fill',
        selectors: [{ type: 'css', value: '#owner', confidence: 0.9 }],
        value: 'alice',
        parameterRef: 'owner_name',
      },
      output: null,
      error: null,
      createdAt: now,
    },
    {
      id: 2,
      sessionId: 'rec-session-1',
      seq: 2,
      type: 'click',
      input: {
        type: 'click',
        selectors: [{ type: 'css', value: 'button[type=submit]', confidence: 0.8 }],
      },
      output: null,
      error: null,
      createdAt: now,
    },
    {
      id: 3,
      sessionId: 'rec-session-1',
      seq: 3,
      type: 'extract',
      input: {
        type: 'extract',
        target: 'results',
        extractionType: 'table',
        selectors: [{ type: 'css', value: 'table.results', confidence: 0.95 }],
      },
      output: null,
      error: null,
      createdAt: now,
    },
  ];
}

describe('WorkflowDraftBuilder', () => {
  it('builds deterministic workflow with sequential edges', () => {
    const builder = new WorkflowDraftBuilder();
    const built = builder.buildFromActions({
      session: sessionFixture(),
      actions: actionsFixture(),
      workflowId: 'wf-recorded',
    });

    expect(built.workflow.id).toBe('wf-recorded');
    expect(built.workflow.steps[0]?.type).toBe('navigate');
    expect(built.workflow.steps.some((step) => step.type === 'extract')).toBe(true);
    expect(built.workflow.edges.length).toBe(built.workflow.steps.length - 1);
    expect(built.workflow.inputParameters.some((param) => param.name === 'owner_name')).toBe(true);
    expect(built.workflow.extractionTargets.some((target) => target.name === 'results')).toBe(true);
  });

  it('returns navigate-only workflow when no actions are present', () => {
    const builder = new WorkflowDraftBuilder();
    const built = builder.buildFromActions({
      session: sessionFixture(),
      actions: [],
      workflowId: 'wf-empty',
    });

    expect(built.workflow.steps).toHaveLength(1);
    expect(built.workflow.steps[0]?.type).toBe('navigate');
    expect(built.warnings.length).toBeGreaterThan(0);
  });
});

describe('RecorderService', () => {
  it('finalize returns validation issues array and workflow', () => {
    const service = new RecorderService();
    const finalized = service.finalize({
      session: sessionFixture(),
      actions: actionsFixture(),
      workflowId: 'wf-final',
    });

    expect(finalized.ok).toBe(true);
    if (finalized.ok) {
      expect(finalized.data.workflow.id).toBe('wf-final');
      expect(Array.isArray(finalized.data.issues)).toBe(true);
    }
  });
});
