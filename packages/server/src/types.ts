import type { FastifyInstance } from 'fastify';
import type { Logger } from 'pino';

import type { DiscoveryResult } from '@fireapi/browser';
import type { WorkflowGraph, WorkflowValidationIssue } from '@fireapi/core';
import type {
  RecorderActionInput,
  RecorderActionRecord,
  RecorderSessionRecord,
} from '@fireapi/recorder';

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

export interface AuthProvider {
  authorize(ctx: {
    headers: Record<string, string | undefined>;
    path: string;
    method: string;
  }): Promise<void>;
}

export interface FireAPIServerOptions {
  databaseUrl: string;
  firecrawlApiKey?: string;
  host?: string;
  port?: number;
  runnerConcurrency?: number;
  pollIntervalMs?: number;
  autoMigrate?: boolean;
  authProvider?: AuthProvider;
  logger?: Logger;
  dashboard?: {
    enabled?: boolean;
    basePath?: string;
    assetsPath?: string;
  };
  recorder?: {
    maxActiveSessions?: number;
    actionTimeoutMs?: number;
    idleSessionTtlMs?: number;
  };
}

export interface FireAPIServerInstance {
  start(): Promise<void>;
  stop(): Promise<void>;
  app: FastifyInstance;
}

export interface WorkflowRecord {
  id: string;
  name: string;
  hash: string;
  graph: WorkflowGraph;
  sourceUrl: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RunRecord {
  id: string;
  name: string | null;
  workflowId: string | null;
  workflowSnapshot: WorkflowGraph;
  input: Record<string, unknown>;
  status: RunStatus;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  trace: Record<string, unknown>[] | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ValidateWorkflowResponse {
  valid: boolean;
  issues: WorkflowValidationIssue[];
}

export interface DashboardOverviewResponse {
  workflowsTotal: number;
  runsByStatus: Record<RunStatus, number>;
  activeRecorderSessions: number;
  recentRuns: Array<{
    runId: string;
    status: RunStatus;
    createdAt: string;
    workflowId: string | null;
  }>;
}

export interface RecorderSessionCreateResponse {
  session: RecorderSessionRecord;
  initialDiscovery: DiscoveryResult;
}

export interface RecorderSessionGetResponse {
  session: RecorderSessionRecord;
  lastDiscovery?: DiscoveryResult;
}

export interface RecorderActionCreateResponse {
  action: RecorderActionRecord;
  lastDiscovery?: DiscoveryResult;
}

export interface RecorderSessionFinalizeResponse {
  workflow: WorkflowGraph;
  issues: WorkflowValidationIssue[];
  warnings: string[];
  registeredWorkflowId?: string;
}

export interface RecorderController {
  createSession(input: { url: string; name?: string }): Promise<RecorderSessionCreateResponse>;
  listSessions(input: {
    status?: RecorderSessionRecord['status'];
    limit?: number;
    cursor?: string;
  }): Promise<{ items: RecorderSessionRecord[]; nextCursor?: string }>;
  getSession(sessionId: string): Promise<RecorderSessionGetResponse | null>;
  addAction(
    sessionId: string,
    action: RecorderActionInput,
  ): Promise<RecorderActionCreateResponse | null>;
  listActions(input: {
    sessionId: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: RecorderActionRecord[]; nextCursor?: string }>;
  finalizeSession(input: {
    sessionId: string;
    register?: boolean;
    name?: string;
  }): Promise<RecorderSessionFinalizeResponse | null>;
  stopSession(sessionId: string): Promise<RecorderSessionRecord | null>;
  cleanupIdleSessions(): Promise<number>;
  stopAll?(): Promise<void>;
}
