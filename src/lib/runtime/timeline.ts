/**
 * Timeline query services — read model for session and run timelines.
 *
 * These services project runtime_events + messages + tool_calls + artifacts
 * into structured timeline views for the UI.
 */

import type {
  ArtifactRow,
  MessageRow,
  RunRow,
  RuntimeEventRow,
  RuntimeStore,
  ToolCallRow,
} from "./store";

export interface SessionTimeline {
  sessionId: string;
  messages: MessageTimelineEntry[];
  runs: RunSummary[];
  artifacts: ArtifactEntry[];
  toolCalls: ToolCallEntry[];
  activeRunId: string | null;
}

export interface RunTimeline {
  runId: string;
  sessionId: string;
  status: string;
  skillName: string;
  workflowType: string | null;
  ticker: string | null;
  market: string | null;
  messages: MessageTimelineEntry[];
  events: RuntimeEventRow[];
  toolCalls: ToolCallEntry[];
  artifacts: ArtifactEntry[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface MessageTimelineEntry {
  id: string;
  role: string;
  content: string;
  messageType: string;
  runId: string | null;
  createdAt: string;
}

export interface RunSummary {
  id: string;
  status: string;
  skillName: string;
  ticker: string | null;
  createdAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface ArtifactEntry {
  id: string;
  runId: string;
  kind: string;
  name: string;
  path: string | null;
  content: string | null;
  mimeType: string | null;
  contentType: string | null;
  createdAt: string;
}

export interface ToolCallEntry {
  id: string;
  runId: string;
  name: string;
  status: string;
  capability: string | null;
  providerId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  latencyMs: number | null;
  createdAt: string;
}

/**
 * Build a session timeline from the canonical read model.
 */
export async function buildSessionTimeline(
  store: RuntimeStore,
  sessionId: string,
): Promise<SessionTimeline> {
  const messages = await store.messages.findBySession(sessionId);
  const runs = await store.runs.findBySession(sessionId);
  const session = await store.sessions.findById(sessionId);

  // Collect all tool calls and artifacts for runs in this session
  const allToolCalls: ToolCallEntry[] = [];
  const allArtifacts: ArtifactEntry[] = [];

  for (const run of runs) {
    const toolCalls = await store.tools.findByRun(run.id);
    const artifacts = await store.artifacts.findByRun(run.id);

    allToolCalls.push(...toolCalls.map(toToolCallEntry));
    allArtifacts.push(...artifacts.map(toArtifactEntry));
  }

  return {
    sessionId,
    messages: messages.map(toMessageEntry),
    runs: runs.map(toRunSummary),
    artifacts: allArtifacts,
    toolCalls: allToolCalls,
    activeRunId: session?.activeRunId ?? null,
  };
}

/**
 * Build a run timeline from the canonical read model.
 */
export async function buildRunTimeline(
  store: RuntimeStore,
  runId: string,
): Promise<RunTimeline | null> {
  const run = await store.runs.findById(runId);
  if (!run) return null;

  const messages = await store.messages.findByRun(runId);
  const events = await store.events.findByRun(runId);
  const toolCalls = await store.tools.findByRun(runId);
  const artifacts = await store.artifacts.findByRun(runId);

  return {
    runId,
    sessionId: run.sessionId,
    status: run.status,
    skillName: run.skillName,
    workflowType: run.workflowType ?? null,
    ticker: run.ticker ?? null,
    market: run.market ?? null,
    messages: messages.map(toMessageEntry),
    events,
    toolCalls: toolCalls.map(toToolCallEntry),
    artifacts: artifacts.map(toArtifactEntry),
    createdAt: run.createdAt,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    durationMs: run.durationMs ?? null,
  };
}

// ─── Mappers ─────────────────────────────────────────────────────────

function toMessageEntry(m: MessageRow): MessageTimelineEntry {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    messageType: m.messageType ?? "plain",
    runId: m.runId ?? null,
    createdAt: m.createdAt,
  };
}

function toRunSummary(r: RunRow): RunSummary {
  return {
    id: r.id,
    status: r.status,
    skillName: r.skillName,
    ticker: r.ticker ?? null,
    createdAt: r.createdAt,
    finishedAt: r.finishedAt ?? null,
    durationMs: r.durationMs ?? null,
  };
}

function toToolCallEntry(t: ToolCallRow): ToolCallEntry {
  return {
    id: t.id,
    runId: t.runId,
    name: t.name,
    status: t.status,
    capability: t.capability ?? null,
    providerId: t.providerId ?? null,
    startedAt: t.startedAt ?? null,
    finishedAt: t.finishedAt ?? null,
    latencyMs: t.latencyMs ?? null,
    createdAt: t.createdAt,
  };
}

function toArtifactEntry(a: ArtifactRow): ArtifactEntry {
  return {
    id: a.id,
    runId: a.runId,
    kind: a.kind,
    name: a.name,
    path: a.path ?? null,
    content: a.inlineContent ?? a.content ?? null,
    mimeType: a.mimeType ?? null,
    contentType: a.contentType ?? a.mimeType ?? null,
    createdAt: a.createdAt,
  };
}
