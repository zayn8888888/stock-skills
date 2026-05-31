import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
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

// ── Session cache entry: stores full conversation state ─────────────

interface SessionCacheEntry {
  messages: AgentMessage[];
  toolCalls: ToolCallEntry[];
  streamingText: string;
  pendingRunId: string | null;
  lastAccess: number;
}

// ---------------------------------------------------------------------------
// LRU Session Cache (10 entries)
// ---------------------------------------------------------------------------

const MAX_CACHED_SESSIONS = 10;
const sessionCache = new Map<string, SessionCacheEntry>();

function cacheSession(
  sessionId: string,
  messages: AgentMessage[],
  toolCalls: ToolCallEntry[] = [],
  streamingText = "",
  pendingRunId: string | null = null,
) {
  sessionCache.set(sessionId, {
    messages,
    toolCalls,
    streamingText,
    pendingRunId,
    lastAccess: Date.now(),
  });
  // Evict oldest if over capacity
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

function getCachedSession(sessionId: string): SessionCacheEntry | null {
  const entry = sessionCache.get(sessionId);
  if (!entry) return null;
  entry.lastAccess = Date.now();
  return entry;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface AgentState {
  // Data
  messages: AgentMessage[];
  sessionId: string | null;
  status: "idle" | "streaming" | "error";
  streamingText: string;
  streamingThinking: string;
  toolCalls: ToolCallEntry[];

  // SSE status (mirrors useSSE)
  sseStatus: "disconnected" | "connected" | "reconnecting";
  sseRetryAttempt: number;

  // Loading
  sessionLoading: boolean;

  // Pending run (waiting for assistant response)
  pendingRunId: string | null;

  // Actions
  switchSession: (sessionId: string) => void;
  loadHistory: (
    sessionId: string,
    messages: AgentMessage[],
    toolCallsByRun?: Record<string, ToolCallEntry[]>,
  ) => void;
  addMessage: (message: AgentMessage) => void;
  appendDelta: (delta: string) => void;
  appendThinkingDelta: (delta: string) => void;
  addToolCall: (toolCall: ToolCallEntry) => void;
  updateToolCall: (id: string, update: Partial<ToolCallEntry>) => void;
  clearStreaming: (force?: boolean) => void;
  syncFromServer: (sessionId: string) => Promise<void>;
  setSSEStatus: (status: "disconnected" | "connected" | "reconnecting") => void;
  setSSERetryAttempt: (attempt: number) => void;
  setPendingRunId: (runId: string) => void;
  fetchRunArtifacts: (runId: string) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  // Initial state
  messages: [],
  sessionId: null,
  status: "idle",
  streamingText: "",
  streamingThinking: "",
  toolCalls: [],
  sseStatus: "disconnected",
  sseRetryAttempt: 0,
  sessionLoading: false,
  pendingRunId: null as string | null,

  switchSession: (sessionId: string) => {
    const state = get();

    // Save current session state before switching
    if (state.sessionId) {
      cacheSession(
        state.sessionId,
        state.messages,
        state.toolCalls,
        state.streamingText,
        state.pendingRunId,
      );
    }

    // Load target session
    const cached = getCachedSession(sessionId);
    if (cached) {
      set({
        sessionId,
        messages: cached.messages,
        toolCalls: cached.toolCalls,
        streamingText: cached.streamingText,
        pendingRunId: cached.pendingRunId,
        status: cached.streamingText ? "streaming" : "idle",
        sessionLoading: false,
      });
    } else {
      set({
        sessionId,
        messages: [],
        streamingText: "",
        toolCalls: [],
        status: "idle",
        pendingRunId: null,
        sessionLoading: true,
      });
    }
  },

  loadHistory: (
    sessionId: string,
    messages: AgentMessage[],
    toolCallsByRun?: Record<string, ToolCallEntry[]>,
  ) => {
    // Attach historical tool calls to assistant messages by runId
    const attachedRunIds = new Set<string>();
    let merged = messages;
    if (toolCallsByRun) {
      merged = messages.map((msg) => {
        if (msg.role === "assistant" && msg.runId && toolCallsByRun[msg.runId]?.length) {
          attachedRunIds.add(msg.runId);
          return { ...msg, toolCalls: toolCallsByRun[msg.runId] };
        }
        return msg;
      });
    }

    // A running session may not have an assistant message yet, but its tool
    // events can already be persisted. Keep those visible as pending activity.
    const orphanEntries = Object.entries(toolCallsByRun ?? {}).filter(
      ([runId, calls]) => !attachedRunIds.has(runId) && calls.length > 0,
    );
    const orphanToolCalls = orphanEntries.flatMap(([, calls]) => calls);
    const orphanRunId = orphanEntries[0]?.[0] ?? null;
    const current = get();
    const streamingText = current.sessionId === sessionId ? current.streamingText : "";
    const pendingToolCalls =
      orphanToolCalls.length > 0
        ? orphanToolCalls
        : current.sessionId === sessionId
          ? current.toolCalls
          : [];
    const pendingRunId =
      orphanRunId ?? (current.sessionId === sessionId ? current.pendingRunId : null);
    const isResuming = streamingText.length > 0 || pendingToolCalls.length > 0;

    cacheSession(sessionId, merged, pendingToolCalls, streamingText, pendingRunId);
    set({
      messages: merged,
      sessionId,
      toolCalls: pendingToolCalls,
      streamingText,
      pendingRunId,
      status: isResuming ? "streaming" : "idle",
      sessionLoading: false,
    });
  },

  addMessage: (message: AgentMessage) => {
    const state = get();
    const next = [...state.messages, message];
    if (state.sessionId) {
      cacheSession(state.sessionId, next, state.toolCalls, state.streamingText, state.pendingRunId);
    }
    set({ messages: next });
  },

  appendDelta: (delta: string) => {
    set((s) => ({
      streamingText: s.streamingText + delta,
      status: "streaming",
    }));
    const state = get();
    if (state.sessionId) {
      cacheSession(
        state.sessionId,
        state.messages,
        state.toolCalls,
        state.streamingText,
        state.pendingRunId,
      );
    }
  },

  appendThinkingDelta: (delta: string) => {
    set((s) => ({
      streamingThinking: s.streamingThinking + delta,
      status: "streaming",
    }));
  },

  addToolCall: (toolCall: ToolCallEntry) => {
    set((s) => ({
      toolCalls: [...s.toolCalls, toolCall],
      status: "streaming",
    }));
    const state = get();
    if (state.sessionId) {
      cacheSession(
        state.sessionId,
        state.messages,
        state.toolCalls,
        state.streamingText,
        state.pendingRunId,
      );
    }
  },

  updateToolCall: (id: string, update: Partial<ToolCallEntry>) => {
    set((s) => ({
      toolCalls: s.toolCalls.map((tc) => (tc.id === id ? { ...tc, ...update } : tc)),
    }));
    const state = get();
    if (state.sessionId) {
      cacheSession(
        state.sessionId,
        state.messages,
        state.toolCalls,
        state.streamingText,
        state.pendingRunId,
      );
    }
  },

  /**
   * Clear streaming state and create an assistant message.
   *
   * If `force` is false (default) and streamingText is empty but toolCalls
   * exist, the tool calls are preserved as a tool-only assistant message.
   * If `force` is true, all streaming state is discarded.
   */
  clearStreaming: (force = false) => {
    const state = get();
    const hasText = state.streamingText.length > 0;
    const hasToolCalls = state.toolCalls.length > 0;

    if (!force && (hasText || hasToolCalls)) {
      // Create assistant message with whatever we have
      const assistantMsg: AgentMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: state.streamingText || (hasToolCalls ? "" : ""),
        timestamp: Date.now(),
        toolCalls: hasToolCalls ? [...state.toolCalls] : undefined,
        runId: state.pendingRunId ?? undefined,
      };
      const next = [...state.messages, assistantMsg];
      if (state.sessionId) {
        cacheSession(state.sessionId, next);
      }
      set({
        messages: next,
        streamingText: "",
        streamingThinking: "",
        toolCalls: [],
        status: "idle",
        pendingRunId: null,
      });
    } else {
      if (state.sessionId) {
        cacheSession(state.sessionId, state.messages);
      }
      set({
        streamingText: "",
        streamingThinking: "",
        toolCalls: [],
        status: "idle",
        pendingRunId: null,
      });
    }
  },

  /**
   * Sync messages from the server API.
   * Called after a run completes to ensure the DB-persisted assistant
   * message (which may not have been fully captured via SSE) is loaded.
   */
  syncFromServer: async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`);
      if (!res.ok) return;
      const msgs: Array<{
        message_id: string;
        role: string;
        content: string;
        created_at: string;
        metadata?: Record<string, unknown> | null;
      }> = await res.json();

      // Also fetch tool events so we can attach them to assistant messages
      let toolCallsByRun: Record<string, ToolCallEntry[]> = {};
      try {
        const toolRes = await fetch(`/api/sessions/${sessionId}/tool-events`);
        if (toolRes.ok) toolCallsByRun = await toolRes.json();
      } catch {
        // ignore
      }

      // Build a map of existing tool calls from current store state (by runId)
      // so we don't lose tool calls that arrived via SSE but aren't in the DB yet
      const current = get();
      const storeToolCallsByRun = new Map<string, ToolCallEntry[]>();
      for (const msg of current.messages) {
        if (msg.runId && msg.toolCalls?.length) {
          storeToolCallsByRun.set(msg.runId, msg.toolCalls);
        }
      }

      const agentMessages: AgentMessage[] = msgs.map((m) => {
        const runId = m.metadata?.runId as string | undefined;
        // Prefer DB tool calls, fall back to store-cached ones
        const dbTools = runId ? toolCallsByRun[runId] : undefined;
        const storeTools = runId ? storeToolCallsByRun.get(runId) : undefined;
        const toolCalls = dbTools?.length ? dbTools : storeTools;
        return {
          id: m.message_id,
          role: m.role as AgentMessage["role"],
          content: m.content,
          timestamp: new Date(m.created_at).getTime(),
          runId,
          toolCalls: toolCalls?.length ? toolCalls : undefined,
        };
      });

      // Only update if this is still the current session
      if (current.sessionId !== sessionId) return;

      cacheSession(sessionId, agentMessages);
      set({
        messages: agentMessages,
        sessionLoading: false,
      });
    } catch {
      // silently ignore
    }
  },

  setPendingRunId: (runId: string) => {
    set({ pendingRunId: runId, status: "streaming" });
    const state = get();
    if (state.sessionId) {
      cacheSession(state.sessionId, state.messages, state.toolCalls, state.streamingText, runId);
    }
  },

  fetchRunArtifacts: async (runId: string) => {
    try {
      const res = await fetch(`/api/runs/${runId}/artifacts`);
      if (!res.ok) return;
      const data: Array<{
        artifact_id?: string;
        id?: string;
        kind: string;
        name: string;
        path?: string | null;
        content?: string | null;
        mime_type?: string | null;
      }> = await res.json();
      if (!Array.isArray(data) || data.length === 0) return;

      const artifacts: ArtifactEntry[] = data.map((a) => ({
        id: a.artifact_id ?? a.id ?? "",
        kind: a.kind,
        name: a.name,
        path: a.path,
        content: a.content,
        mimeType: a.mime_type,
      }));

      // Attach artifacts to the assistant message that has this runId
      set((s) => ({
        messages: s.messages.map((msg) => (msg.runId === runId ? { ...msg, artifacts } : msg)),
      }));
    } catch {
      // silently ignore artifact fetch errors
    }
  },

  setSSEStatus: (sseStatus) => set({ sseStatus }),
  setSSERetryAttempt: (sseRetryAttempt) => set({ sseRetryAttempt }),
}));
