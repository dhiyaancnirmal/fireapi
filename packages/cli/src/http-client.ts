import type {
  AutoWorkflowGenerationResult,
  WorkflowGraph,
  WorkflowValidationIssue,
} from '@fireapi/core';

import type { DiscoveryResult } from '@fireapi/browser';
import type {
  RecorderActionInput,
  RecorderActionRecord,
  RecorderSessionRecord,
} from '@fireapi/recorder';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

export interface FireAPIClientOptions {
  baseUrl: string;
}

export interface DiscoveryResponse {
  discovery: DiscoveryResult;
}

export interface ValidateResponse {
  valid: boolean;
  issues: WorkflowValidationIssue[];
}

export interface RegisterWorkflowResponse {
  workflowId: string;
  hash: string;
  createdAt: string;
}

export interface RunStatusResponse {
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

export interface ListRunsResponse {
  items: RunStatusResponse[];
  nextCursor?: string;
}

export interface RecorderSessionResponse {
  session: RecorderSessionRecord;
  initialDiscovery?: DiscoveryResult;
  lastDiscovery?: DiscoveryResult;
}

export interface RecorderFinalizeResponse {
  workflow: WorkflowGraph;
  issues: Array<{
    severity: string;
    code: string;
    message: string;
    path?: string;
  }>;
  warnings: string[];
  registeredWorkflowId?: string;
}

export class FireAPIClient {
  private readonly baseUrl: string;

  constructor(options: FireAPIClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
  }

  async health(): Promise<{
    ok: true;
    service: string;
    version: string;
    time: string;
  }> {
    return this.request('/v1/health', { method: 'GET' });
  }

  async discover(input: {
    url: string;
    options?: Record<string, unknown>;
  }): Promise<DiscoveryResponse> {
    return this.request('/v1/discovery', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async generateWorkflow(input: {
    discovery: DiscoveryResult;
    options?: Record<string, unknown>;
  }): Promise<AutoWorkflowGenerationResult> {
    return this.request('/v1/workflows/generate', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async validateWorkflow(workflow: WorkflowGraph): Promise<ValidateResponse> {
    return this.request('/v1/workflows/validate', {
      method: 'POST',
      body: JSON.stringify({ workflow }),
    });
  }

  async registerWorkflow(input: {
    workflow: WorkflowGraph;
    name?: string;
  }): Promise<RegisterWorkflowResponse> {
    return this.request('/v1/workflows/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async createRun(input: {
    workflowId?: string;
    workflow?: WorkflowGraph;
    input: Record<string, unknown>;
    name?: string;
  }): Promise<{ runId: string; status: string; createdAt: string }> {
    return this.request('/v1/runs', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getRun(runId: string): Promise<RunStatusResponse> {
    return this.request(`/v1/runs/${encodeURIComponent(runId)}`, { method: 'GET' });
  }

  async listRuns(input: {
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<ListRunsResponse> {
    const url = new URL('/v1/runs', `${this.baseUrl}/`);
    if (input.status) {
      url.searchParams.set('status', input.status);
    }
    if (input.limit !== undefined) {
      url.searchParams.set('limit', String(input.limit));
    }
    if (input.cursor) {
      url.searchParams.set('cursor', input.cursor);
    }

    return this.request(url.pathname + url.search, { method: 'GET' });
  }

  async cancelRun(runId: string): Promise<{ runId: string; status: string }> {
    return this.request(`/v1/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
    });
  }

  async createRecorderSession(input: {
    url: string;
    name?: string;
  }): Promise<RecorderSessionResponse> {
    return this.request('/v1/recorder/sessions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getRecorderSession(sessionId: string): Promise<RecorderSessionResponse> {
    return this.request(`/v1/recorder/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
    });
  }

  async listRecorderSessions(input: {
    status?: RecorderSessionRecord['status'];
    limit?: number;
    cursor?: string;
  }): Promise<{ items: RecorderSessionRecord[]; nextCursor?: string }> {
    const url = new URL('/v1/recorder/sessions', `${this.baseUrl}/`);
    if (input.status) {
      url.searchParams.set('status', input.status);
    }
    if (input.limit !== undefined) {
      url.searchParams.set('limit', String(input.limit));
    }
    if (input.cursor) {
      url.searchParams.set('cursor', input.cursor);
    }

    return this.request(url.pathname + url.search, { method: 'GET' });
  }

  async addRecorderAction(
    sessionId: string,
    action: RecorderActionInput,
  ): Promise<{ action: RecorderActionRecord; lastDiscovery?: DiscoveryResult }> {
    return this.request(`/v1/recorder/sessions/${encodeURIComponent(sessionId)}/actions`, {
      method: 'POST',
      body: JSON.stringify(action),
    });
  }

  async listRecorderActions(input: {
    sessionId: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: RecorderActionRecord[]; nextCursor?: string }> {
    const url = new URL(
      `/v1/recorder/sessions/${encodeURIComponent(input.sessionId)}/actions`,
      `${this.baseUrl}/`,
    );
    if (input.limit !== undefined) {
      url.searchParams.set('limit', String(input.limit));
    }
    if (input.cursor) {
      url.searchParams.set('cursor', input.cursor);
    }

    return this.request(url.pathname + url.search, { method: 'GET' });
  }

  async finalizeRecorderSession(input: {
    sessionId: string;
    register?: boolean;
    name?: string;
  }): Promise<RecorderFinalizeResponse> {
    return this.request(`/v1/recorder/sessions/${encodeURIComponent(input.sessionId)}/finalize`, {
      method: 'POST',
      body: JSON.stringify({
        ...(input.register !== undefined ? { register: input.register } : {}),
        ...(input.name ? { name: input.name } : {}),
      }),
    });
  }

  async stopRecorderSession(sessionId: string): Promise<{ sessionId: string; status: string }> {
    return this.request(`/v1/recorder/sessions/${encodeURIComponent(sessionId)}/stop`, {
      method: 'POST',
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : undefined;

    if (!response.ok) {
      const errorPayload = payload as ErrorEnvelope | undefined;
      const message =
        errorPayload?.error?.message ?? `HTTP ${response.status} ${response.statusText}`;
      const code = errorPayload?.error?.code;
      throw new Error(code ? `${code}: ${message}` : message);
    }

    return payload as T;
  }
}
