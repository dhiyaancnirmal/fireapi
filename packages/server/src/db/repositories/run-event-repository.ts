import { and, asc, eq } from 'drizzle-orm';

import type { DatabaseClient } from '../client.js';
import { runEvents } from '../schema.js';

export interface RunEventRecord {
  id: number;
  runId: string;
  seq: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

function toIso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

function parsePayload(input: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return {};
}

function mapEvent(row: typeof runEvents.$inferSelect): RunEventRecord {
  return {
    id: row.id,
    runId: row.runId,
    seq: row.seq,
    type: row.type,
    payload: parsePayload(row.payloadJson),
    createdAt: toIso(row.createdAt),
  };
}

export class RunEventRepository {
  private readonly findMaxSeqStmt;
  private readonly insertStmt;

  constructor(private readonly client: DatabaseClient) {
    this.findMaxSeqStmt = this.client.sqlite.prepare<
      [{ runId: string }],
      { maxSeq: number | null }
    >('SELECT MAX(seq) as maxSeq FROM run_events WHERE run_id = @runId');
    this.insertStmt = this.client.sqlite.prepare(
      'INSERT INTO run_events(run_id, seq, type, payload_json, created_at) VALUES(@runId, @seq, @type, @payloadJson, @createdAt)',
    );
  }

  async append(
    runId: string,
    type: string,
    payload: Record<string, unknown> = {},
  ): Promise<RunEventRecord> {
    const createdAt = Date.now();
    const payloadJson = JSON.stringify(payload);

    const transaction = this.client.sqlite.transaction(() => {
      const max = this.findMaxSeqStmt.get({ runId });
      const nextSeq = (max?.maxSeq ?? 0) + 1;
      const result = this.insertStmt.run({ runId, seq: nextSeq, type, payloadJson, createdAt });
      return {
        id: Number(result.lastInsertRowid),
        runId,
        seq: nextSeq,
        type,
        payload,
        createdAt,
      };
    });

    const inserted = transaction();
    return {
      id: inserted.id,
      runId: inserted.runId,
      seq: inserted.seq,
      type: inserted.type,
      payload: inserted.payload,
      createdAt: toIso(inserted.createdAt),
    };
  }

  async listForRun(runId: string): Promise<RunEventRecord[]> {
    const rows = await this.client.db
      .select()
      .from(runEvents)
      .where(and(eq(runEvents.runId, runId)))
      .orderBy(asc(runEvents.seq));
    return rows.map(mapEvent);
  }

  async isCancellationRequested(runId: string): Promise<boolean> {
    const rows = await this.client.db
      .select({ id: runEvents.id })
      .from(runEvents)
      .where(and(eq(runEvents.runId, runId), eq(runEvents.type, 'cancel_requested')))
      .limit(1);
    return rows.length > 0;
  }
}
