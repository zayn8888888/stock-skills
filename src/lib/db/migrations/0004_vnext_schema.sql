-- vNext schema: canonical runtime tables
-- Adds app_meta, command_log, runtime_events, tool_calls, runner_providers, runner_runs.
-- Extends existing sessions, messages, runs, artifacts, data_providers, data_capabilities, data_source_routes.
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS command_log (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  command_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  actor TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  request_json TEXT NOT NULL,
  response_json TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS runner_providers (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  config_json TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_check_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS runner_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  runner_id TEXT NOT NULL REFERENCES runner_providers(id),
  external_thread_id TEXT,
  external_run_id TEXT,
  trace_id TEXT,
  checkpoint_ref TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS runtime_events (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  session_seq INTEGER NOT NULL,
  run_seq INTEGER,
  scope TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  run_id TEXT REFERENCES runs(id),
  message_id TEXT REFERENCES messages(id),
  tool_call_id TEXT,
  artifact_id TEXT,
  parent_event_id TEXT,
  correlation_id TEXT,
  idempotency_key TEXT,
  producer TEXT NOT NULL,
  visibility TEXT NOT NULL,
  persist INTEGER NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL,
  capability TEXT,
  provider_id TEXT,
  adapter_id TEXT,
  route_id TEXT,
  status TEXT NOT NULL,
  args_json TEXT,
  result_json TEXT,
  result_text TEXT,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT,
  finished_at TEXT,
  latency_ms INTEGER,
  created_event_id TEXT,
  result_event_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
-- Extend sessions: add vNext columns
ALTER TABLE sessions ADD COLUMN title TEXT;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN active_run_id TEXT;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN active_goal_id TEXT;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN default_ticker TEXT;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN default_market TEXT;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN metadata_json TEXT;
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN archived_at TEXT;
--> statement-breakpoint
-- Extend messages: add vNext columns
ALTER TABLE messages ADD COLUMN run_id TEXT REFERENCES runs(id);
--> statement-breakpoint
ALTER TABLE messages ADD COLUMN parent_message_id TEXT;
--> statement-breakpoint
ALTER TABLE messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'plain';
--> statement-breakpoint
ALTER TABLE messages ADD COLUMN message_status TEXT NOT NULL DEFAULT 'visible';
--> statement-breakpoint
ALTER TABLE messages ADD COLUMN content_format TEXT NOT NULL DEFAULT 'markdown';
--> statement-breakpoint
ALTER TABLE messages ADD COLUMN metadata_json TEXT;
--> statement-breakpoint
ALTER TABLE messages ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
-- Extend runs: add vNext columns
ALTER TABLE runs ADD COLUMN message_id TEXT REFERENCES messages(id);
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN parent_run_id TEXT REFERENCES runs(id);
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN runner_id TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN workflow_type TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN execution_mode TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN ticker TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN market TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN intent TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN model_id TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN request_id TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN owner TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN caller TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN error_code TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN error_message TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN metadata_json TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN queued_at TEXT;
--> statement-breakpoint
-- Extend artifacts: add vNext columns
ALTER TABLE artifacts ADD COLUMN session_id TEXT;
--> statement-breakpoint
ALTER TABLE artifacts ADD COLUMN inline_content TEXT;
--> statement-breakpoint
ALTER TABLE artifacts ADD COLUMN content_type TEXT;
--> statement-breakpoint
ALTER TABLE artifacts ADD COLUMN schema_version TEXT;
--> statement-breakpoint
ALTER TABLE artifacts ADD COLUMN producer TEXT;
--> statement-breakpoint
ALTER TABLE artifacts ADD COLUMN source_event_id TEXT;
--> statement-breakpoint
ALTER TABLE artifacts ADD COLUMN sha256 TEXT;
--> statement-breakpoint
ALTER TABLE artifacts ADD COLUMN size_bytes INTEGER;
--> statement-breakpoint
ALTER TABLE artifacts ADD COLUMN metadata_json TEXT;
--> statement-breakpoint
-- Extend data_providers: add vNext columns
ALTER TABLE data_providers ADD COLUMN slug TEXT;
--> statement-breakpoint
ALTER TABLE data_providers ADD COLUMN kind TEXT;
--> statement-breakpoint
ALTER TABLE data_providers ADD COLUMN connection_config_json TEXT;
--> statement-breakpoint
-- Extend data_capabilities: rename to vNext
ALTER TABLE data_capabilities ADD COLUMN params_schema_json TEXT;
--> statement-breakpoint
ALTER TABLE data_capabilities ADD COLUMN response_schema_json TEXT;
--> statement-breakpoint
-- Extend data_source_routes: add vNext columns
ALTER TABLE data_source_routes ADD COLUMN markets_json TEXT;
--> statement-breakpoint
ALTER TABLE data_source_routes ADD COLUMN config_json TEXT;
--> statement-breakpoint
-- Indexes for runtime_events
CREATE INDEX IF NOT EXISTS idx_runtime_events_session_seq ON runtime_events(session_id, session_seq);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_runtime_events_run_seq ON runtime_events(run_id, run_seq) WHERE run_id IS NOT NULL AND run_seq IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_runtime_events_session_created ON runtime_events(session_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_runtime_events_run_created ON runtime_events(run_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_runtime_events_type_created ON runtime_events(type, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_runtime_events_idempotency ON runtime_events(idempotency_key) WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
-- Indexes for tool_calls
CREATE INDEX IF NOT EXISTS idx_tool_calls_run ON tool_calls(run_id, created_at);
--> statement-breakpoint
-- Indexes for runner_runs
CREATE INDEX IF NOT EXISTS idx_runner_runs_run ON runner_runs(run_id);
--> statement-breakpoint
-- Seed app_meta with schema version
INSERT OR IGNORE INTO app_meta (key, value, updated_at) VALUES ('schema_version', 'research-runtime-db.vNext.1', datetime('now'));
