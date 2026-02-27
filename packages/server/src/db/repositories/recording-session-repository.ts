import { and, desc, eq, lt, or } from 'drizzle-orm';
import { ulid } from 'ulid';

import type { DiscoveryResult } from '@fireapi/browser';
import type { WorkflowGraph } from '@fireapi/core';
import type { RecorderSessionRecord, RecorderSessionStatus } from '@fireapi/recorder';

import type { DatabaseClient } from '../client.js';
import { recordingSessions } from '../schema.js';

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

interface ParsedCursor {
  createdAt: number;
  id: string;
}

function parseCursor(cursor?: string): ParsedCursor | null {
  if (!cursor) {
    return null;
  }

  const separator = cursor.indexOf(':');
  if (separator <= 0 || separator >= cursor.length - 1) {
    return null;
  }

  const createdAt = Number(cursor.slice(0, separator));
  const id = cursor.slice(separator + 1);
  if (!Number.isFinite(createdAt) || !id) {
    return null;
  }

  return { createdAt, id };
}

function encodeCursor(row: RecorderSessionRecord): string {
  return `${new Date(row.createdAt).getTime()}:${row.id}`;
}

export interface RecordingSessionDetails {
  session: RecorderSessionRecord;
  lastDiscovery: DiscoveryResult | null;
  draftWorkflow: WorkflowGraph | null;
  error: Record<string, unknown> | null;
}

function mapSession(row: typeof recordingSessions.$inferSelect): RecordingSessionDetails {
  return {
    session: {
      id: row.id,
      name: row.name,
      status: row.status,
      startUrl: row.startUrl,
      currentUrl: row.currentUrl,
      firecrawlSessionId: row.firecrawlSessionId,
      liveViewUrl: row.liveViewUrl,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      finishedAt: row.finishedAt ? toIso(row.finishedAt) : null,
    },
    lastDiscovery: parseJson<DiscoveryResult>(row.lastDiscoveryJson),
    draftWorkflow: parseJson<WorkflowGraph>(row.draftWorkflowJson),
    error: parseJson<Record<string, unknown>>(row.errorJson),
  };
}

export interface CreateRecordingSessionInput {
  name?: string;
  startUrl: string;
  currentUrl?: string;
  firecrawlSessionId: string;
  liveViewUrl: string;
  lastDiscovery?: DiscoveryResult;
}

export interface ListRecordingSessionsInput {
  status?: RecorderSessionStatus;
  limit?: number;
  cursor?: string;
}

export interface ListRecordingSessionsOutput {
  items: RecorderSessionRecord[];
  nextCursor?: string;
}

export interface UpdateRecordingSessionInput {
  id: string;
  status?: RecorderSessionStatus;
  name?: string;
  currentUrl?: string | null;
  lastDiscovery?: DiscoveryResult | null;
  draftWorkflow?: WorkflowGraph | null;
  error?: Record<string, unknown> | null;
  finishedAt?: string | null;
}

export class RecordingSessionRepository {
  constructor(private readonly client: DatabaseClient) {}

  async create(input: CreateRecordingSessionInput): Promise<RecordingSessionDetails> {
    const id = ulid();
    const now = Date.now();

    await this.client.db.insert(recordingSessions).values({
      id,
      name: input.name ?? null,
      status: 'active',
      startUrl: input.startUrl,
      currentUrl: input.currentUrl ?? input.startUrl,
      firecrawlSessionId: input.firecrawlSessionId,
      liveViewUrl: input.liveViewUrl,
      lastDiscoveryJson: input.lastDiscovery ? JSON.stringify(input.lastDiscovery) : null,
      draftWorkflowJson: null,
      errorJson: null,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    });

    const created = await this.getById(id);
    if (!created) {
      throw new Error('Recording session insert succeeded but record was not found');
    }

    return created;
  }

  async getById(id: string): Promise<RecordingSessionDetails | null> {
    const rows = await this.client.db
      .select()
      .from(recordingSessions)
      .where(eq(recordingSessions.id, id))
      .limit(1);
    const row = rows[0];
    return row ? mapSession(row) : null;
  }

  async list(input: ListRecordingSessionsInput = {}): Promise<ListRecordingSessionsOutput> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const cursor = parseCursor(input.cursor);

    let whereClause = input.status ? eq(recordingSessions.status, input.status) : undefined;
    if (cursor) {
      const cursorCondition = or(
        lt(recordingSessions.createdAt, cursor.createdAt),
        and(eq(recordingSessions.createdAt, cursor.createdAt), lt(recordingSessions.id, cursor.id)),
      );
      whereClause = whereClause ? and(whereClause, cursorCondition) : cursorCondition;
    }

    const query = this.client.db
      .select()
      .from(recordingSessions)
      .orderBy(desc(recordingSessions.createdAt), desc(recordingSessions.id))
      .limit(limit + 1);

    const rows = whereClause ? await query.where(whereClause) : await query;
    const mapped = rows.map((row) => mapSession(row).session);
    const hasMore = mapped.length > limit;
    const items = hasMore ? mapped.slice(0, limit) : mapped;
    const last = items[items.length - 1];

    return {
      items,
      ...(hasMore && last ? { nextCursor: encodeCursor(last) } : {}),
    };
  }

  async update(input: UpdateRecordingSessionInput): Promise<RecordingSessionDetails | null> {
    const setValues: Partial<typeof recordingSessions.$inferInsert> = {
      updatedAt: Date.now(),
    };

    if (input.status !== undefined) {
      setValues.status = input.status;
    }
    if (input.name !== undefined) {
      setValues.name = input.name;
    }
    if (input.currentUrl !== undefined) {
      setValues.currentUrl = input.currentUrl;
    }
    if (input.lastDiscovery !== undefined) {
      setValues.lastDiscoveryJson = input.lastDiscovery
        ? JSON.stringify(input.lastDiscovery)
        : null;
    }
    if (input.draftWorkflow !== undefined) {
      setValues.draftWorkflowJson = input.draftWorkflow
        ? JSON.stringify(input.draftWorkflow)
        : null;
    }
    if (input.error !== undefined) {
      setValues.errorJson = input.error ? JSON.stringify(input.error) : null;
    }
    if (input.finishedAt !== undefined) {
      setValues.finishedAt = input.finishedAt ? new Date(input.finishedAt).getTime() : null;
    }

    await this.client.db
      .update(recordingSessions)
      .set(setValues)
      .where(eq(recordingSessions.id, input.id));

    return this.getById(input.id);
  }

  async countByStatus(status: RecorderSessionStatus): Promise<number> {
    const rows = await this.client.db
      .select({ id: recordingSessions.id })
      .from(recordingSessions)
      .where(eq(recordingSessions.status, status));
    return rows.length;
  }
}
