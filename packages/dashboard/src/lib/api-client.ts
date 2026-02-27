import type { DiscoveryResult, SelectorStrategy } from '@fireapi/browser';
import type { WorkflowGraph } from '@fireapi/core';

export interface RunResponse {
  runId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  workflowId?: string;
  input: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: Record<string, unknown>;
  trace?: Record<string, unknown>[];
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface RecorderSessionResponse {
  id: string;
  name: string | null;
  status: 'active' | 'stopped' | 'finalized' | 'failed';
  startUrl: string;
  currentUrl: string | null;
  firecrawlSessionId: string;
  liveViewUrl: string;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export type RecorderActionInput =
  | { type: 'navigate'; url: string }
  | { type: 'fill'; selectors: SelectorStrategy[]; value: string; parameterRef?: string }
  | { type: 'select'; selectors: SelectorStrategy[]; value: string; parameterRef?: string }
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

export interface RecorderActionRecord {
  id: number;
  sessionId: string;
  seq: number;
  type: RecorderActionInput['type'];
  input: RecorderActionInput;
  output: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  createdAt: string;
}

const baseUrl =
  (import.meta.env.VITE_FIREAPI_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : undefined;

  if (!response.ok) {
    const message =
      (payload as { error?: { message?: string } } | undefined)?.error?.message ??
      `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export async function fetchOverview(): Promise<{
  workflowsTotal: number;
  runsByStatus: Record<'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled', number>;
  activeRecorderSessions: number;
  recentRuns: Array<{
    runId: string;
    status: string;
    createdAt: string;
    workflowId: string | null;
  }>;
}> {
  return request('/v1/dashboard/overview');
}

export async function fetchWorkflow(id: string): Promise<{ workflow: WorkflowGraph }> {
  return request(`/v1/workflows/${encodeURIComponent(id)}`);
}

export async function fetchRuns(): Promise<{ items: RunResponse[] }> {
  return request('/v1/runs?limit=20');
}

export async function fetchRun(id: string): Promise<RunResponse> {
  return request(`/v1/runs/${encodeURIComponent(id)}`);
}

export async function runDiscovery(url: string): Promise<{ discovery: DiscoveryResult }> {
  return request('/v1/discovery', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export async function createRecorderSession(input: {
  url: string;
  name?: string;
}): Promise<{ session: RecorderSessionResponse; initialDiscovery: DiscoveryResult }> {
  return request('/v1/recorder/sessions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function fetchRecorderSession(
  sessionId: string,
): Promise<{ session: RecorderSessionResponse; lastDiscovery?: DiscoveryResult }> {
  return request(`/v1/recorder/sessions/${encodeURIComponent(sessionId)}`);
}

export async function listRecorderActions(
  sessionId: string,
): Promise<{ items: RecorderActionRecord[]; nextCursor?: string }> {
  return request(`/v1/recorder/sessions/${encodeURIComponent(sessionId)}/actions?limit=50`);
}

export async function addRecorderAction(
  sessionId: string,
  action: RecorderActionInput,
): Promise<{ action: RecorderActionRecord; lastDiscovery?: DiscoveryResult }> {
  return request(`/v1/recorder/sessions/${encodeURIComponent(sessionId)}/actions`, {
    method: 'POST',
    body: JSON.stringify(action),
  });
}

export async function finalizeRecorderSession(input: {
  sessionId: string;
  register?: boolean;
  name?: string;
}): Promise<{
  workflow: WorkflowGraph;
  issues: unknown[];
  warnings: string[];
  registeredWorkflowId?: string;
}> {
  return request(`/v1/recorder/sessions/${encodeURIComponent(input.sessionId)}/finalize`, {
    method: 'POST',
    body: JSON.stringify({ register: input.register, name: input.name }),
  });
}

export async function stopRecorderSession(
  sessionId: string,
): Promise<{ sessionId: string; status: string }> {
  return request(`/v1/recorder/sessions/${encodeURIComponent(sessionId)}/stop`, {
    method: 'POST',
  });
}
