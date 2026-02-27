import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { RunStatus } from '../types.js';

export const workflows = sqliteTable(
  'workflows',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    hash: text('hash').notNull(),
    graphJson: text('graph_json').notNull(),
    sourceUrl: text('source_url'),
    version: integer('version').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    workflowsHashUnique: uniqueIndex('workflows_hash_unique').on(table.hash),
  }),
);

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  name: text('name'),
  workflowId: text('workflow_id').references(() => workflows.id),
  workflowSnapshotJson: text('workflow_snapshot_json').notNull(),
  inputJson: text('input_json').notNull(),
  status: text('status').$type<RunStatus>().notNull(),
  resultJson: text('result_json'),
  errorJson: text('error_json'),
  traceJson: text('trace_json'),
  createdAt: integer('created_at').notNull(),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at'),
});

export const runEvents = sqliteTable(
  'run_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    payloadJson: text('payload_json').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    runEventsRunSeqUnique: uniqueIndex('run_events_run_id_seq_unique').on(table.runId, table.seq),
  }),
);

export const recordingSessions = sqliteTable('recording_sessions', {
  id: text('id').primaryKey(),
  name: text('name'),
  status: text('status').$type<'active' | 'stopped' | 'finalized' | 'failed'>().notNull(),
  startUrl: text('start_url').notNull(),
  currentUrl: text('current_url'),
  firecrawlSessionId: text('firecrawl_session_id').notNull(),
  liveViewUrl: text('live_view_url').notNull(),
  lastDiscoveryJson: text('last_discovery_json'),
  draftWorkflowJson: text('draft_workflow_json'),
  errorJson: text('error_json'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  finishedAt: integer('finished_at'),
});

export const recordingActions = sqliteTable(
  'recording_actions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id')
      .notNull()
      .references(() => recordingSessions.id),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    inputJson: text('input_json').notNull(),
    outputJson: text('output_json'),
    errorJson: text('error_json'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    recordingActionsSessionSeqUnique: uniqueIndex('recording_actions_session_id_seq_unique').on(
      table.sessionId,
      table.seq,
    ),
  }),
);

export type WorkflowRow = typeof workflows.$inferSelect;
export type NewWorkflowRow = typeof workflows.$inferInsert;

export type RunRow = typeof runs.$inferSelect;
export type NewRunRow = typeof runs.$inferInsert;

export type RunEventRow = typeof runEvents.$inferSelect;
export type NewRunEventRow = typeof runEvents.$inferInsert;

export type RecordingSessionRow = typeof recordingSessions.$inferSelect;
export type NewRecordingSessionRow = typeof recordingSessions.$inferInsert;

export type RecordingActionRow = typeof recordingActions.$inferSelect;
export type NewRecordingActionRow = typeof recordingActions.$inferInsert;
