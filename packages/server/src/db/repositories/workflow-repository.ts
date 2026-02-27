import { type WorkflowGraph, hashValue, stableStringifyWorkflow } from '@fireapi/core';
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { ConflictError } from '../../errors.js';
import type { WorkflowRecord } from '../../types.js';
import type { DatabaseClient } from '../client.js';
import { workflows } from '../schema.js';

function toIso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

function parseJson<T>(value: string, fallbackMessage: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(fallbackMessage);
  }
}

function mapWorkflowRow(row: typeof workflows.$inferSelect): WorkflowRecord {
  return {
    id: row.id,
    name: row.name,
    hash: row.hash,
    graph: parseJson<WorkflowGraph>(row.graphJson, 'Stored workflow JSON is invalid'),
    sourceUrl: row.sourceUrl,
    version: row.version,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export interface RegisterWorkflowInput {
  workflow: WorkflowGraph;
  name?: string;
}

export class WorkflowRepository {
  constructor(private readonly client: DatabaseClient) {}

  async register(input: RegisterWorkflowInput): Promise<WorkflowRecord> {
    const hash = hashValue(input.workflow);
    const existing = await this.getByHash(hash);
    if (existing) {
      return existing;
    }

    const now = Date.now();
    const id = input.workflow.id || ulid();

    try {
      await this.client.db.insert(workflows).values({
        id,
        name: input.name ?? input.workflow.name,
        hash,
        graphJson: stableStringifyWorkflow(input.workflow),
        sourceUrl: input.workflow.sourceUrl,
        version: input.workflow.version,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        String((error as { code?: unknown }).code).includes('SQLITE_CONSTRAINT')
      ) {
        const workflow = await this.getByHash(hash);
        if (workflow) {
          return workflow;
        }
        throw new ConflictError('Workflow hash already exists', { hash });
      }
      throw error;
    }

    const created = await this.getById(id);
    if (!created) {
      throw new Error('Workflow insert succeeded but record was not found');
    }

    return created;
  }

  async getById(id: string): Promise<WorkflowRecord | null> {
    const rows = await this.client.db.select().from(workflows).where(eq(workflows.id, id)).limit(1);
    const row = rows[0];
    return row ? mapWorkflowRow(row) : null;
  }

  async getByHash(hash: string): Promise<WorkflowRecord | null> {
    const rows = await this.client.db
      .select()
      .from(workflows)
      .where(and(eq(workflows.hash, hash)))
      .limit(1);
    const row = rows[0];
    return row ? mapWorkflowRow(row) : null;
  }

  async count(): Promise<number> {
    const rows = await this.client.db.select({ id: workflows.id }).from(workflows);
    return rows.length;
  }
}
