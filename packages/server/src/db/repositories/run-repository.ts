import { and, desc, eq, lt, or } from 'drizzle-orm';
import { ulid } from 'ulid';

import type { WorkflowGraph } from '@fireapi/core';

import type { RunRecord, RunStatus } from '../../types.js';
import type { DatabaseClient } from '../client.js';
import { runs } from '../schema.js';

export interface CreateRunInput {
  workflowId?: string;
  workflowSnapshot: WorkflowGraph;
  input: Record<string, unknown>;
  name?: string;
}

export interface ListRunsInput {
  status?: RunStatus;
  limit?: number;
  cursor?: string;
}

export interface ListRunsOutput {
  items: RunRecord[];
  nextCursor?: string;
}

interface ParsedCursor {
  createdAt: number;
  id: string;
}

function toIso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parseObject(value: string | null): Record<string, unknown> | null {
  const parsed = parseJson<unknown>(value);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return null;
}

function parseTrace(value: string | null): Record<string, unknown>[] | null {
  const parsed = parseJson<unknown>(value);
  if (Array.isArray(parsed)) {
    return parsed.filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === 'object' && !Array.isArray(entry),
    );
  }
  return null;
}

function mapRun(row: typeof runs.$inferSelect): RunRecord {
  return {
    id: row.id,
    name: row.name,
    workflowId: row.workflowId,
    workflowSnapshot: JSON.parse(row.workflowSnapshotJson) as WorkflowGraph,
    input: (parseObject(row.inputJson) ?? {}) as Record<string, unknown>,
    status: row.status,
    result: parseObject(row.resultJson),
    error: parseObject(row.errorJson),
    trace: parseTrace(row.traceJson),
    createdAt: toIso(row.createdAt),
    startedAt: row.startedAt ? toIso(row.startedAt) : null,
    finishedAt: row.finishedAt ? toIso(row.finishedAt) : null,
  };
}

function parseCursor(cursor?: string): ParsedCursor | null {
  if (!cursor) {
    return null;
  }
  const separator = cursor.indexOf(':');
  if (separator <= 0 || separator === cursor.length - 1) {
    return null;
  }
  const createdAt = Number(cursor.slice(0, separator));
  const id = cursor.slice(separator + 1);
  if (!Number.isFinite(createdAt) || !id) {
    return null;
  }
  return { createdAt, id };
}

function encodeCursor(run: RunRecord): string {
  return `${new Date(run.createdAt).getTime()}:${run.id}`;
}

export class RunRepository {
  private readonly claimSelectStmt;
  private readonly claimUpdateStmt;

  constructor(private readonly client: DatabaseClient) {
    this.claimSelectStmt = this.client.sqlite.prepare(
      "SELECT id FROM runs WHERE status = 'queued' ORDER BY created_at ASC, id ASC LIMIT 1",
    );
    this.claimUpdateStmt = this.client.sqlite.prepare(
      "UPDATE runs SET status = 'running', started_at = @startedAt WHERE id = @id AND status = 'queued'",
    );
  }

  async createQueued(input: CreateRunInput): Promise<RunRecord> {
    const id = ulid();
    const now = Date.now();

    await this.client.db.insert(runs).values({
      id,
      name: input.name ?? null,
      workflowId: input.workflowId ?? null,
      workflowSnapshotJson: JSON.stringify(input.workflowSnapshot),
      inputJson: JSON.stringify(input.input),
      status: 'queued',
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      resultJson: null,
      errorJson: null,
      traceJson: null,
    });

    const created = await this.getById(id);
    if (!created) {
      throw new Error('Run insert succeeded but record was not found');
    }
    return created;
  }

  async getById(id: string): Promise<RunRecord | null> {
    const rows = await this.client.db.select().from(runs).where(eq(runs.id, id)).limit(1);
    const row = rows[0];
    return row ? mapRun(row) : null;
  }

  async list(input: ListRunsInput = {}): Promise<ListRunsOutput> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const cursor = parseCursor(input.cursor);

    let whereClause = input.status ? eq(runs.status, input.status) : undefined;
    if (cursor) {
      const cursorCondition = or(
        lt(runs.createdAt, cursor.createdAt),
        and(eq(runs.createdAt, cursor.createdAt), lt(runs.id, cursor.id)),
      );
      whereClause = whereClause ? and(whereClause, cursorCondition) : cursorCondition;
    }

    const query = this.client.db
      .select()
      .from(runs)
      .orderBy(desc(runs.createdAt), desc(runs.id))
      .limit(limit + 1);

    const rows = whereClause ? await query.where(whereClause) : await query;
    const mapped = rows.map(mapRun);
    const hasMore = mapped.length > limit;
    const items = hasMore ? mapped.slice(0, limit) : mapped;
    const last = items[items.length - 1];

    return {
      items,
      ...(hasMore && last ? { nextCursor: encodeCursor(last) } : {}),
    };
  }

  async claimNextQueued(): Promise<RunRecord | null> {
    const transaction = this.client.sqlite.transaction(() => {
      const row = this.claimSelectStmt.get() as { id: string } | undefined;
      if (!row?.id) {
        return null;
      }
      const updated = this.claimUpdateStmt.run({ id: row.id, startedAt: Date.now() });
      if (updated.changes === 0) {
        return null;
      }
      return row.id;
    });

    const runId = transaction();
    if (!runId) {
      return null;
    }

    return this.getById(runId);
  }

  async markSucceeded(
    runId: string,
    result: Record<string, unknown>,
    trace: Record<string, unknown>[] | null,
  ): Promise<void> {
    const finishedAt = Date.now();
    await this.client.db
      .update(runs)
      .set({
        status: 'succeeded',
        resultJson: JSON.stringify(result),
        errorJson: null,
        traceJson: trace ? JSON.stringify(trace) : null,
        finishedAt,
      })
      .where(eq(runs.id, runId));
  }

  async markFailed(
    runId: string,
    error: Record<string, unknown>,
    trace: Record<string, unknown>[] | null,
  ): Promise<void> {
    const finishedAt = Date.now();
    await this.client.db
      .update(runs)
      .set({
        status: 'failed',
        errorJson: JSON.stringify(error),
        traceJson: trace ? JSON.stringify(trace) : null,
        finishedAt,
      })
      .where(eq(runs.id, runId));
  }

  async markCancelled(runId: string): Promise<boolean> {
    const finishedAt = Date.now();
    const result = await this.client.db
      .update(runs)
      .set({ status: 'cancelled', finishedAt })
      .where(and(eq(runs.id, runId), or(eq(runs.status, 'queued'), eq(runs.status, 'running'))));

    const count = Number((result as { changes?: unknown }).changes ?? 0);
    return count > 0;
  }

  async updateTrace(runId: string, trace: Record<string, unknown>[]): Promise<void> {
    await this.client.db
      .update(runs)
      .set({ traceJson: JSON.stringify(trace) })
      .where(eq(runs.id, runId));
  }

  async countByStatus(status?: RunStatus): Promise<number> {
    const query = this.client.db.select({ id: runs.id }).from(runs);
    const rows = status ? await query.where(eq(runs.status, status)) : await query;
    return rows.length;
  }

  async listRecent(limit = 10): Promise<RunRecord[]> {
    const rows = await this.client.db
      .select()
      .from(runs)
      .orderBy(desc(runs.createdAt), desc(runs.id))
      .limit(Math.min(Math.max(limit, 1), 100));
    return rows.map(mapRun);
  }
}
