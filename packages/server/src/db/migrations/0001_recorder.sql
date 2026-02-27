CREATE TABLE IF NOT EXISTS recording_sessions (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT NOT NULL,
  start_url TEXT NOT NULL,
  current_url TEXT,
  firecrawl_session_id TEXT NOT NULL,
  live_view_url TEXT NOT NULL,
  last_discovery_json TEXT,
  draft_workflow_json TEXT,
  error_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS recording_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES recording_sessions(id),
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  input_json TEXT NOT NULL,
  output_json TEXT,
  error_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS recording_actions_session_id_seq_unique ON recording_actions(session_id, seq);
CREATE INDEX IF NOT EXISTS recording_sessions_status_created_at_idx ON recording_sessions(status, created_at);
CREATE INDEX IF NOT EXISTS recording_actions_session_id_created_at_idx ON recording_actions(session_id, created_at);
