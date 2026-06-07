import type { RuntimeEvent } from "@/lib/runtime/events";
import { create } from "zustand";
import {
  type RuntimeMessage,
  type RuntimeState,
  applyRuntimeEvent,
  createInitialState,
} from "./runtime-reducer";

// ---------------------------------------------------------------------------
// Types (backward-compatible with existing UI components)
// ---------------------------------------------------------------------------

export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolCalls?: ToolCallEntry[];
  runId?: string;
  artifacts?: ArtifactEntry[];
}

export interface ArtifactEntry {
  id: string;
  kind: string;
  name: string;
  path?: string | null;
  content?: string | null;
  mimeType?: string | null;
}

export interface ToolCallEntry {
  id: string;
  name: string;
  args?: string;
  result?: string;
  status: "pending" | "running" | "completed" | "error";
}

// ── Session cache ─────────────────────────────────────────────────────

interface SessionCacheEntry {
  runtime: RuntimeState;
  lastAccess: number;
}

const MAX_CACHED_SESSIONS = 10;
const sessionCache = new Map<string, SessionCacheEntry>();

function cacheSession(sessionId: string, runtime: RuntimeState) {
  sessionCache.set(sessionId, { runtime, lastAccess: Date.now() });
  if (sessionCache.size > MAX_CACHED_SESSIONS) {
    let oldestKey: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;
    for (const [key, entry] of sessionCache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey) sessionCache.delete(oldestKey);
  }
}

function getCachedSession(sessionId: string): SessionState | null {
  const entry = sessionCache.get(sessionId);
  if (!entry) return null;
  entry.lastAccess = Date.now();
  return entry.runtime;
}

// ---------------------------------------------------------------------------
// Derived types for backward compatibility
// ---------------------------------------------------------------------------

type SessionState = RuntimeState;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface AgentState {
  // Runtime state (vNext canonical)
  runtime: RuntimeState;
  sessionId: string | null;
  sessionLoading: boolean;
  sseStatus: "disconnected" | "connected" | "reconnecting";
  sseRetryAttempt: number;

  // Actions
  switchSession: (sessionId: string) => void;
  loadTimeline: (sessionId: string, timeline: SessionTimelineResponse) => void;
  addRuntimeEvent: (event: RuntimeEvent) => void;
  syncFromServer: (sessionId: string) => Promise<void>;
  setSSEStatus: (status: "disconnected" | "connected" | "reconnecting") => void;
  setSSERetryAttempt: (attempt: number) => void;
  setPendingRunId: (runId: string) => void;
  fetchRunArtifacts: (runId: string) => Promise<void>;

  // Backward-compatible selectors
  messages: () => AgentMessage[];
  streamingText: () => string;
  streamingThinking: () => string;
  toolCalls: () => ToolCallEntry[];
  pendingRunId: () => string | null;
}

interface SessionTimelineResponse {
  messages: Array<{
    id: string;
    role: string;
    content: string;
    messageType: string;
    runId: string | null;
    createdAt: string;
  }>;
  runs: Array<{
    id: string;
    status: string;
    skillName: string;
    ticker: string | null;
    createdAt: string;
    finishedAt: string | null;
  }>;
  toolCalls: Array<{
    id: string;
    runId: string;
    name: string;
    status: string;
    createdAt: string;
  }>;
  artifacts: Array<{
    id: string;
    runId: string;
    kind: string;
    name: string;
    path: string | null;
  }>;
  activeRunId: string | null;
}

/** Convert RuntimeMessage to backward-compatible AgentMessage */
function toAgentMessage(m: RuntimeMessage, rt: RuntimeState): AgentMessage {
  const toolCallsForMsg = Object.values(rt.toolCallsById).filter((tc) => tc.runId === m.runId);
  const artifactsForMsg = m.runId ? (rt.artifactsByRunId[m.runId] ?? []) : [];

  return {
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.createdAt).getTime(),
    runId: m.runId ?? undefined,
    toolCalls:
      toolCallsForMsg.length > 0
        ? toolCallsForMsg.map((tc) => ({
            id: tc.id,
            name: tc.name,
            args: tc.args ? JSON.stringify(tc.args) : undefined,
            result: tc.result ? JSON.stringify(tc.result) : undefined,
            status: tc.status as ToolCallEntry["status"],
          }))
        : undefined,
    artifacts:
      artifactsForMsg.length > 0
        ? artifactsForMsg.map((a) => ({
            id: a.id,
            kind: a.kind,
            name: a.name,
            path: a.path,
          }))
        : undefined,
  };
}

const messagesCache = new WeakMap<RuntimeState, AgentMessage[]>();
const toolCallsCache = new WeakMap<RuntimeState, ToolCallEntry[]>();

function deriveMessages(runtime: RuntimeState): AgentMessage[] {
  const cached = messagesCache.get(runtime);
  if (cached) return cached;

  const messages = runtime.messageOrder
    .map((id) => runtime.messagesById[id])
    .filter(Boolean)
    .map((message) => toAgentMessage(message, runtime));
  messagesCache.set(runtime, messages);
  return messages;
}

function deriveToolCalls(runtime: RuntimeState): ToolCallEntry[] {
  const cached = toolCallsCache.get(runtime);
  if (cached) return cached;

  const toolCalls = Object.values(runtime.toolCallsById).map((toolCall) => ({
    id: toolCall.id,
    name: toolCall.name,
    args: toolCall.args ? JSON.stringify(toolCall.args) : undefined,
    result: toolCall.result ? JSON.stringify(toolCall.result) : undefined,
    status: toolCall.status as ToolCallEntry["status"],
  }));
  toolCallsCache.set(runtime, toolCalls);
  return toolCalls;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  runtime: createInitialState(),
  sessionId: null,
  sessionLoading: false,
  sseStatus: "disconnected",
  sseRetryAttempt: 0,

  switchSession: (sessionId: string) => {
    const state = get();
    // Save current session
    if (state.sessionId) {
      cacheSession(state.sessionId, state.runtime);
    }

    if (!sessionId) {
      set({ sessionId: null, runtime: createInitialState(), sessionLoading: false });
      return;
    }

    // Load target session
    const cached = getCachedSession(sessionId);
    if (cached) {
      set({ sessionId, runtime: cached, sessionLoading: false });
    } else {
      set({ sessionId, runtime: createInitialState(), sessionLoading: true });
    }
  },

  loadTimeline: (sessionId: string, timeline: SessionTimelineResponse) => {
    const _state = get();
    let rt = createInitialState();

    // Load messages
    for (const m of timeline.messages) {
      const msg: RuntimeMessage = {
        id: m.id,
        role: m.role as RuntimeMessage["role"],
        content: m.content,
        runId: m.runId,
        createdAt: m.createdAt,
      };
      rt = {
        ...rt,
        messagesById: { ...rt.messagesById, [m.id]: msg },
        messageOrder: [...rt.messageOrder, m.id],
      };
    }

    // Load runs
    for (const r of timeline.runs) {
      rt.runsById[r.id] = {
        id: r.id,
        status: r.status,
        skillName: r.skillName,
        ticker: r.ticker ?? undefined,
        createdAt: r.createdAt,
        finishedAt: r.finishedAt ?? undefined,
      };
    }

    // Load tool calls
    for (const tc of timeline.toolCalls) {
      rt.toolCallsById[tc.id] = {
        id: tc.id,
        runId: tc.runId,
        name: tc.name,
        status: tc.status,
        createdAt: tc.createdAt,
      };
    }

    // Load artifacts
    for (const a of timeline.artifacts) {
      const existing = rt.artifactsByRunId[a.runId] ?? [];
      rt.artifactsByRunId[a.runId] = [
        ...existing,
        { id: a.id, runId: a.runId, kind: a.kind, name: a.name, path: a.path ?? undefined },
      ];
    }

    rt.activeRunId = timeline.activeRunId;

    cacheSession(sessionId, rt);
    set({ runtime: rt, sessionId, sessionLoading: false });
  },

  addRuntimeEvent: (event: RuntimeEvent) => {
    const state = get();
    try {
      const nextRuntime = applyRuntimeEvent(state.runtime, event);
      set({ runtime: nextRuntime });
      if (state.sessionId) {
        cacheSession(state.sessionId, nextRuntime);
      }
    } catch (err) {
      // Log but don't crash on unknown events
      console.warn("[agent-store] Failed to apply event:", err);
    }
  },

  syncFromServer: async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/timeline`);
      if (!res.ok) return;
      const timeline = (await res.json()) as SessionTimelineResponse;
      const state = get();
      if (state.sessionId !== sessionId) return;
      get().loadTimeline(sessionId, timeline);
    } catch {
      // silently ignore
    }
  },

  setSSEStatus: (sseStatus) => set({ sseStatus }),
  setSSERetryAttempt: (sseRetryAttempt) => set({ sseRetryAttempt }),

  setPendingRunId: (_runId: string) => {
    // vNext: active run is tracked in runtime.runsById
    // This is kept for backward compatibility
  },

  fetchRunArtifacts: async (_runId: string) => {
    // vNext: artifacts come via RuntimeEvent or timeline API
    // This is kept for backward compatibility
  },

  // ─── Backward-compatible selectors ──────────────────────────────
  messages: () => {
    const { runtime } = get();
    return deriveMessages(runtime);
  },

  streamingText: () => {
    const { runtime } = get();
    if (!runtime.activeRunId) return "";
    return runtime.streamByRunId[runtime.activeRunId]?.text ?? "";
  },

  streamingThinking: () => {
    const { runtime } = get();
    if (!runtime.activeRunId) return "";
    return runtime.streamByRunId[runtime.activeRunId]?.reasoningSummary ?? "";
  },

  toolCalls: () => {
    const { runtime } = get();
    return deriveToolCalls(runtime);
  },

  pendingRunId: () => {
    const { runtime } = get();
    return runtime.activeRunId;
  },
}));
