import type { SelectorStrategy } from '@fireapi/browser';
import type { WorkflowGraph, WorkflowValidationIssue } from '@fireapi/core';

export type RecorderSessionStatus = 'active' | 'stopped' | 'finalized' | 'failed';

export type RecorderActionType = 'navigate' | 'fill' | 'select' | 'click' | 'wait' | 'extract';

export type RecorderActionInput =
  | { type: 'navigate'; url: string }
  | {
      type: 'fill';
      selectors: SelectorStrategy[];
      value: string;
      parameterRef?: string;
    }
  | {
      type: 'select';
      selectors: SelectorStrategy[];
      value: string;
      parameterRef?: string;
    }
  | { type: 'click'; selectors: SelectorStrategy[] }
  | {
      type: 'wait';
      condition: 'selector' | 'networkidle' | 'timeout';
      value: string | number;
      selectors?: SelectorStrategy[];
    }
  | {
      type: 'extract';
      target: string;
      extractionType: 'text' | 'attribute' | 'table' | 'list';
      selectors: SelectorStrategy[];
      attributeName?: string;
      listItemSelector?: string;
      listItemMode?: 'text' | 'attribute';
      listItemAttributeName?: string;
    };

export interface RecorderSessionRecord {
  id: string;
  name: string | null;
  status: RecorderSessionStatus;
  startUrl: string;
  currentUrl: string | null;
  firecrawlSessionId: string;
  liveViewUrl: string;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface RecorderActionRecord {
  id: number;
  sessionId: string;
  seq: number;
  type: RecorderActionType;
  input: RecorderActionInput;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  createdAt: string;
}

export interface FinalizeRecordingResult {
  workflow: WorkflowGraph;
  issues: WorkflowValidationIssue[];
  warnings: string[];
}

export type RecorderResult<T, E = Error> = { ok: true; data: T } | { ok: false; error: E };

export interface WorkflowDraftBuildOptions {
  session: Pick<RecorderSessionRecord, 'id' | 'name' | 'startUrl'>;
  actions: RecorderActionRecord[];
  workflowName?: string;
  workflowId?: string;
}

export interface WorkflowDraftBuildResult {
  workflow: WorkflowGraph;
  warnings: string[];
}
