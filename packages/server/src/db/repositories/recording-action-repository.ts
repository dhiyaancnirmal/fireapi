import { and, asc, desc, eq, gt, lt, or } from 'drizzle-orm';

import type { RecorderActionInput, RecorderActionRecord } from '@fireapi/recorder';

import type { DatabaseClient } from '../client.js';
import { recordingActions } from '../schema.js';

interface ParsedCursor {
  createdAt: number;
  id: number;
}

function toIso(epochMs: number): string {
  return new Date(epochMs).toISOString();
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
  const id = Number(cursor.slice(separator + 1));
  if (!Number.isFinite(createdAt) || !Number.isFinite(id)) {
    return null;
  }
  return { createdAt, id };
}

function encodeCursor(row: RecorderActionRecord): string {
  return `${new Date(row.createdAt).getTime()}:${row.id}`;
}

function parseObject(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // no-op
  }
  return null;
}

function parseActionInput(value: string): RecorderActionInput {
  return JSON.parse(value) as RecorderActionInput;
}

function mapAction(row: typeof recordingActions.$inferSelect): RecorderActionRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    seq: row.seq,
    type: row.type as RecorderActionRecord['type'],
    input: parseActionInput(row.inputJson),
    output: parseObject(row.outputJson),
    error: parseObject(row.errorJson),
    createdAt: toIso(row.createdAt),
  };
}

export interface ListRecordingActionsInput {
  sessionId: string;
  limit?: number;
  cursor?: string;
  ascending?: boolean;
}

export interface ListRecordingActionsOutput {
  items: RecorderActionRecord[];
  nextCursor?: string;
}

export class RecordingActionRepository {
  private readonly findMaxSeqStmt;
  private readonly insertStmt;

  constructor(private readonly client: DatabaseClient) {
    this.findMaxSeqStmt = this.client.sqlite.prepare<
      [{ sessionId: string }],
      { maxSeq: number | null }
    >('SELECT MAX(seq) as maxSeq FROM recording_actions WHERE session_id = @sessionId');

    this.insertStmt = this.client.sqlite.prepare(
      'INSERT INTO recording_actions(session_id, seq, type, input_json, output_json, error_json, created_at) VALUES(@sessionId, @seq, @type, @inputJson, @outputJson, @errorJson, @createdAt)',
    );
  }

  async append(input: {
    sessionId: string;
    action: RecorderActionInput;
    output?: Record<string, unknown> | null;
    error?: Record<string, unknown> | null;
  }): Promise<RecorderActionRecord> {
    const createdAt = Date.now();
    const transaction = this.client.sqlite.transaction(() => {
      const max = this.findMaxSeqStmt.get({ sessionId: input.sessionId });
      const nextSeq = (max?.maxSeq ?? 0) + 1;
      const result = this.insertStmt.run({
        sessionId: input.sessionId,
        seq: nextSeq,
        type: input.action.type,
        inputJson: JSON.stringify(input.action),
        outputJson: input.output ? JSON.stringify(input.output) : null,
        errorJson: input.error ? JSON.stringify(input.error) : null,
        createdAt,
      });

      return {
        id: Number(result.lastInsertRowid),
        sessionId: input.sessionId,
        seq: nextSeq,
        type: input.action.type,
        input: input.action,
        output: input.output ?? null,
        error: input.error ?? null,
        createdAt,
      };
    });

    const row = transaction();
    return {
      id: row.id,
      sessionId: row.sessionId,
      seq: row.seq,
      type: row.type,
      input: row.input,
      output: row.output,
      error: row.error,
      createdAt: toIso(row.createdAt),
    };
  }

  async list(input: ListRecordingActionsInput): Promise<ListRecordingActionsOutput> {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const cursor = parseCursor(input.cursor);
    const ascending = input.ascending ?? false;

    let whereClause = eq(recordingActions.sessionId, input.sessionId);
    if (cursor) {
      const cursorCondition = ascending
        ? or(
            gt(recordingActions.createdAt, cursor.createdAt),
            and(
              eq(recordingActions.createdAt, cursor.createdAt),
              gt(recordingActions.id, cursor.id),
            ),
          )
        : or(
            lt(recordingActions.createdAt, cursor.createdAt),
            and(
              eq(recordingActions.createdAt, cursor.createdAt),
              lt(recordingActions.id, cursor.id),
            ),
          );
      whereClause = and(whereClause, cursorCondition) as typeof whereClause;
    }

    const query = this.client.db
      .select()
      .from(recordingActions)
      .where(whereClause)
      .orderBy(
        ascending ? asc(recordingActions.createdAt) : desc(recordingActions.createdAt),
        ascending ? asc(recordingActions.id) : desc(recordingActions.id),
      )
      .limit(limit + 1);

    const rows = await query;
    const mapped = rows.map(mapAction);
    const hasMore = mapped.length > limit;
    const items = hasMore ? mapped.slice(0, limit) : mapped;
    const last = items[items.length - 1];

    return {
      items,
      ...(hasMore && last ? { nextCursor: encodeCursor(last) } : {}),
    };
  }

  async listAllForSession(sessionId: string): Promise<RecorderActionRecord[]> {
    const rows = await this.client.db
      .select()
      .from(recordingActions)
      .where(eq(recordingActions.sessionId, sessionId))
      .orderBy(asc(recordingActions.seq));
    return rows.map(mapAction);
  }
}
