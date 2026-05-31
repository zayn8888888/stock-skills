import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// ──────────────────────────── sessions ────────────────────────────
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  name: text("name"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  endedAt: text("ended_at"),
  status: text("status").notNull().default("active"), // active | paused | completed | archived
});

// ──────────────────────────── messages ────────────────────────────
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  role: text("role").notNull(), // user | assistant | system | tool
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
  metadata: text("metadata"), // JSON string for extra fields
});

// ──────────────────────────── research_goals ─────────────────────
export const researchGoals = sqliteTable(
  "research_goals",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id),
    goal: text("goal").notNull(),
    status: text("status").notNull().default("active"), // active | achieved | abandoned | superseded
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
    uiSummary: text("ui_summary"),
  },
  (t) => [
    // Composite index for fast lookups; the actual partial UNIQUE index
    // (one active goal per session) is defined in the migration SQL.
    index("idx_goals_session_status").on(t.sessionId, t.status),
  ],
);

// ──────────────────────────── goal_criteria ──────────────────────
export const goalCriteria = sqliteTable("goal_criteria", {
  id: text("id").primaryKey(),
  goalId: text("goal_id")
    .notNull()
    .references(() => researchGoals.id),
  criterion: text("criterion").notNull(),
  type: text("type").notNull(), // threshold | trend | qualitative
  targetValue: real("target_value"),
  currentValue: real("current_value"),
  status: text("status").notNull().default("pending"), // pending | met | unmet | na
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ──────────────────────────── goal_evidence ──────────────────────
export const goalEvidence = sqliteTable("goal_evidence", {
  id: text("id").primaryKey(),
  criterionId: text("criterion_id")
    .notNull()
    .references(() => goalCriteria.id),
  evidence: text("evidence").notNull(),
  source: text("source"),
  confidence: real("confidence"), // 0-1
  createdAt: text("created_at").notNull(),
});

// ──────────────────────────── runs ───────────────────────────────
export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  goalId: text("goal_id").references(() => researchGoals.id),
  skillName: text("skill_name").notNull(),
  status: text("status").notNull().default("pending"), // pending | running | success | failed | cancelled
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  durationMs: integer("duration_ms"),
  resultSummary: text("result_summary"),
  createdAt: text("created_at").notNull(),
  metadata: text("metadata"), // JSON string for workflow_type, ticker, market, intent, etc.
});

// ──────────────────────────── artifacts ──────────────────────────
export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  kind: text("kind").notNull(), // report | chart | data | model
  name: text("name").notNull(),
  path: text("path"),
  content: text("content"),
  mimeType: text("mime_type"),
  createdAt: text("created_at").notNull(),
});

// ──────────────────────────── run_events ─────────────────────────
export const runEvents = sqliteTable("run_events", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  timestamp: text("timestamp").notNull(),
  eventType: text("event_type").notNull(), // log | error | progress | tool_use
  data: text("data"), // JSON string
});

// ──────────────────────────── session_events ─────────────────────
export const sessionEvents = sqliteTable("session_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  timestamp: text("timestamp").notNull(),
  eventType: text("event_type").notNull(), // goal_set | goal_achieved | run_started | ...
  data: text("data"), // JSON string
});

// ──────────────────────────── observations ───────────────────────
export const observations = sqliteTable("observations", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  category: text("category").notNull(), // technical | fundamental | sentiment | macro
  ticker: text("ticker"),
  detail: text("detail").notNull(),
  confidence: real("confidence"), // 0-1
  createdAt: text("created_at").notNull(),
});

// ──────────────────────────── decisions ──────────────────────────
export const decisions = sqliteTable("decisions", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  observationId: text("observation_id").references(() => observations.id),
  decision: text("decision").notNull(),
  rationale: text("rationale"),
  confidence: real("confidence"), // 0-1
  createdAt: text("created_at").notNull(),
});

// ──────────────────────────── lessons ────────────────────────────
export const lessons = sqliteTable("lessons", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  category: text("category").notNull(), // strategy | risk | market | tool
  summary: text("summary").notNull(),
  detail: text("detail"),
  createdAt: text("created_at").notNull(),
});

// ──────────────────────────── data_providers ──────────────────────
export const dataProviders = sqliteTable("data_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  adapterId: text("adapter_id").notNull(), // maps to DataSourceAdapter.name
  enabled: integer("enabled").notNull().default(1), // 0 | 1
  connectionConfig: text("connection_config"), // JSON: { host, port, apiKey, ... }
  status: text("status").notNull().default("unknown"), // healthy | degraded | down | unknown
  lastCheckAt: text("last_check_at"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// ──────────────────────────── data_capabilities ──────────────────
export const dataCapabilities = sqliteTable("data_capabilities", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(), // "quote.snapshot", "news.search"
  category: text("category").notNull(), // quote | kline | depth | news | sentiment | capital
  displayName: text("display_name").notNull(),
  description: text("description"),
  paramsSchema: text("params_schema"), // JSON Schema: input parameters
  responseSchema: text("response_schema"), // JSON Schema: response fields + types + descriptions
  createdAt: text("created_at").notNull(),
});

// ──────────────────────────── data_source_routes ─────────────────
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
    markets: text("markets").notNull().default('["*"]'), // JSON: ["HK","US"] or ["*"]
    priority: integer("priority").notNull().default(1), // lower = higher priority
    enabled: integer("enabled").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("idx_route_provider_cap").on(t.providerId, t.capabilityId)],
);
