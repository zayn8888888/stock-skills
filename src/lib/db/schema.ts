import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// ────────────────────────────────────────────────────────────────────
// vNext canonical tables
// ────────────────────────────────────────────────────────────────────

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const commandLog = sqliteTable("command_log", {
  id: text("id").primaryKey(),
  schemaVersion: text("schema_version").notNull(),
  commandType: text("command_type").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  actor: text("actor").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull(),
  requestJson: text("request_json").notNull(),
  responseJson: text("response_json"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull(),
  finishedAt: text("finished_at"),
});

export const runtimeEvents = sqliteTable("runtime_events", {
  id: text("id").primaryKey(),
  schemaVersion: text("schema_version").notNull(),
  sessionSeq: integer("session_seq").notNull(),
  runSeq: integer("run_seq"),
  scope: text("scope").notNull(),
  type: text("type").notNull(),
  category: text("category").notNull(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  runId: text("run_id").references(() => runs.id),
  messageId: text("message_id").references(() => messages.id),
  toolCallId: text("tool_call_id"),
  artifactId: text("artifact_id"),
  parentEventId: text("parent_event_id"),
  correlationId: text("correlation_id"),
  idempotencyKey: text("idempotency_key"),
  producer: text("producer").notNull(),
  visibility: text("visibility").notNull(),
  persist: integer("persist").notNull(),
  payloadJson: text("payload_json"),
  createdAt: text("created_at").notNull(),
},
(t) => [
  uniqueIndex("idx_rt_events_session_seq").on(t.sessionId, t.sessionSeq),
  uniqueIndex("idx_rt_events_run_seq").on(t.runId, t.runSeq),
],
);

export const toolCalls = sqliteTable("tool_calls", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  name: text("name").notNull(),
  capability: text("capability"),
  providerId: text("provider_id"),
  adapterId: text("adapter_id"),
  routeId: text("route_id"),
  status: text("status").notNull(),
  argsJson: text("args_json"),
  resultJson: text("result_json"),
  resultText: text("result_text"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  latencyMs: integer("latency_ms"),
  createdEventId: text("created_event_id"),
  resultEventId: text("result_event_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const runnerProviders = sqliteTable("runner_providers", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  displayName: text("display_name").notNull(),
  enabled: integer("enabled").notNull().default(1),
  configJson: text("config_json"),
  status: text("status").notNull().default("unknown"),
  lastCheckAt: text("last_check_at"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const runnerRuns = sqliteTable("runner_runs", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  runnerId: text("runner_id")
    .notNull()
    .references(() => runnerProviders.id),
  externalThreadId: text("external_thread_id"),
  externalRunId: text("external_run_id"),
  traceId: text("trace_id"),
  checkpointRef: text("checkpoint_ref"),
  metadataJson: text("metadata_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ────────────────────────────────────────────────────────────────────
// Core business tables (vNext extended)
// ────────────────────────────────────────────────────────────────────

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  name: text("name"),
  title: text("title"),
  status: text("status").notNull().default("active"),
  activeRunId: text("active_run_id"),
  activeGoalId: text("active_goal_id"),
  defaultTicker: text("default_ticker"),
  defaultMarket: text("default_market"),
  metadataJson: text("metadata_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  endedAt: text("ended_at"),
  archivedAt: text("archived_at"),
});

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    runId: text("run_id"),
    parentMessageId: text("parent_message_id"),
    role: text("role").notNull(),
    messageType: text("message_type").notNull().default("plain"),
    messageStatus: text("message_status").notNull().default("visible"),
    content: text("content").notNull(),
    contentFormat: text("content_format").notNull().default("markdown"),
    metadata: text("metadata"),
    metadataJson: text("metadata_json"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (t) => [
    index("idx_messages_session_created").on(t.sessionId, t.createdAt),
    index("idx_messages_run").on(t.runId),
  ],
);

export const researchGoals = sqliteTable(
  "research_goals",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    goal: text("goal").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
    uiSummary: text("ui_summary"),
  },
  (t) => [index("idx_goals_session_status").on(t.sessionId, t.status)],
);

export const goalCriteria = sqliteTable("goal_criteria", {
  id: text("id").primaryKey(),
  goalId: text("goal_id")
    .notNull()
    .references(() => researchGoals.id),
  criterion: text("criterion").notNull(),
  type: text("type").notNull(),
  targetValue: real("target_value"),
  currentValue: real("current_value"),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const goalEvidence = sqliteTable("goal_evidence", {
  id: text("id").primaryKey(),
  criterionId: text("criterion_id")
    .notNull()
    .references(() => goalCriteria.id),
  evidence: text("evidence").notNull(),
  source: text("source"),
  confidence: real("confidence"),
  createdAt: text("created_at").notNull(),
});

export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    messageId: text("message_id"),
    parentRunId: text("parent_run_id"),
    goalId: text("goal_id").references(() => researchGoals.id),
    runnerId: text("runner_id"),
    skillName: text("skill_name").notNull(),
    workflowType: text("workflow_type"),
    executionMode: text("execution_mode"),
    status: text("status").notNull().default("pending"),
    ticker: text("ticker"),
    market: text("market"),
    intent: text("intent"),
    modelId: text("model_id"),
    requestId: text("request_id"),
    owner: text("owner"),
    caller: text("caller"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    durationMs: integer("duration_ms"),
    resultSummary: text("result_summary"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    metadata: text("metadata"),
    metadataJson: text("metadata_json"),
    createdAt: text("created_at").notNull(),
    queuedAt: text("queued_at"),
  },
  (t) => [
    index("idx_runs_session_created").on(t.sessionId, t.createdAt),
    index("idx_runs_ticker").on(t.ticker, t.createdAt),
    index("idx_runs_status").on(t.status, t.createdAt),
  ],
);

export const artifacts = sqliteTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id),
    sessionId: text("session_id"),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    path: text("path"),
    content: text("content"),
    inlineContent: text("inline_content"),
    mimeType: text("mime_type"),
    contentType: text("content_type"),
    schemaVersion: text("schema_version"),
    producer: text("producer"),
    sourceEventId: text("source_event_id"),
    sha256: text("sha256"),
    sizeBytes: integer("size_bytes"),
    metadataJson: text("metadata_json"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_artifacts_run").on(t.runId, t.createdAt)],
);

// ────────────────────────────────────────────────────────────────────
// Observation / Decision / Lesson tables (unchanged)
// ────────────────────────────────────────────────────────────────────

export const observations = sqliteTable("observations", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  category: text("category").notNull(),
  ticker: text("ticker"),
  detail: text("detail").notNull(),
  confidence: real("confidence"),
  createdAt: text("created_at").notNull(),
});

export const decisions = sqliteTable("decisions", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  observationId: text("observation_id").references(() => observations.id),
  decision: text("decision").notNull(),
  rationale: text("rationale"),
  confidence: real("confidence"),
  createdAt: text("created_at").notNull(),
});

export const lessons = sqliteTable("lessons", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  category: text("category").notNull(),
  summary: text("summary").notNull(),
  detail: text("detail"),
  createdAt: text("created_at").notNull(),
});

// ────────────────────────────────────────────────────────────────────
// Data source tables (vNext extended)
// ────────────────────────────────────────────────────────────────────

export const dataProviders = sqliteTable("data_providers", {
  id: text("id").primaryKey(),
  slug: text("slug"),
  name: text("name").notNull().unique(),
  adapterId: text("adapter_id").notNull(),
  kind: text("kind"),
  enabled: integer("enabled").notNull().default(1),
  connectionConfig: text("connection_config"),
  connectionConfigJson: text("connection_config_json"),
  status: text("status").notNull().default("unknown"),
  lastCheckAt: text("last_check_at"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const dataCapabilities = sqliteTable("data_capabilities", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  paramsSchema: text("params_schema"),
  responseSchema: text("response_schema"),
  paramsSchemaJson: text("params_schema_json"),
  responseSchemaJson: text("response_schema_json"),
  createdAt: text("created_at").notNull(),
});

export const dataSourceRoutes = sqliteTable(
  "data_source_routes",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => dataProviders.id),
    capabilityId: text("capability_id")
      .notNull()
      .references(() => dataCapabilities.id),
    markets: text("markets").notNull().default('["*"]'),
    marketsJson: text("markets_json"),
    priority: integer("priority").notNull().default(1),
    enabled: integer("enabled").notNull().default(1),
    configJson: text("config_json"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("idx_route_provider_cap").on(t.providerId, t.capabilityId)],
);

// ────────────────────────────────────────────────────────────────────
// LEGACY TABLES — to be removed in Task 11
// run_events and session_events are kept only until old route handlers
// are migrated. The vNext runtime uses runtime_events exclusively.
// ────────────────────────────────────────────────────────────────────

export const runEvents = sqliteTable("run_events", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  timestamp: text("timestamp").notNull(),
  eventType: text("event_type").notNull(),
  data: text("data"),
});

export const sessionEvents = sqliteTable("session_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  timestamp: text("timestamp").notNull(),
  eventType: text("event_type").notNull(),
  data: text("data"),
});
