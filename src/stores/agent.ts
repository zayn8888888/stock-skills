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

interface SessionCacheEntry {
  messages: AgentMessage[];
  lastAccess: number;
}

// ---------------------------------------------------------------------------
// LRU Session Cache (5 entries)
// ---------------------------------------------------------------------------

const MAX_CACHED_SESSIONS = 5;
const sessionCache = new Map<string, SessionCacheEntry>();

function touchSession(sessionId: string, messages: AgentMessage[]) {
  sessionCache.set(sessionId, { messages, lastAccess: Date.now() });
  if (sessionCache.size > MAX_CACHED_SESSIONS) {
    // Evict least recently used
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of sessionCache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey) sessionCache.delete(oldestKey);
  }
}

function getCachedSession(sessionId: string): AgentMessage[] | null {
  const entry = sessionCache.get(sessionId);
  if (!entry) return null;
  entry.lastAccess = Date.now();
  return entry.messages;
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
  loadHistory: (sessionId: string, messages: AgentMessage[]) => void;
  addMessage: (message: AgentMessage) => void;
  appendDelta: (delta: string) => void;
  addToolCall: (toolCall: ToolCallEntry) => void;
  updateToolCall: (id: string, update: Partial<ToolCallEntry>) => void;
  clearStreaming: () => void;
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
  toolCalls: [],
  sseStatus: "disconnected",
  sseRetryAttempt: 0,
  sessionLoading: false,
  pendingRunId: null as string | null,

  switchSession: (sessionId: string) => {
    const cached = getCachedSession(sessionId);
    // Cache current session before switching
    const current = get();
    if (current.sessionId && current.messages.length > 0) {
      touchSession(current.sessionId, current.messages);
    }

    if (cached) {
      set({
        sessionId,
        messages: cached,
        streamingText: "",
        toolCalls: [],
        status: "idle",
        sessionLoading: false,
      });
    } else {
      set({
        sessionId,
        messages: [],
        streamingText: "",
        toolCalls: [],
        status: "idle",
        sessionLoading: true,
      });
    }
  },

  loadHistory: (sessionId: string, messages: AgentMessage[]) => {
    touchSession(sessionId, messages);
    set({
      messages,
      sessionId,
      sessionLoading: false,
    });
  },

  addMessage: (message: AgentMessage) => {
    const next = [...get().messages, message];
    const sid = get().sessionId;
    if (sid) touchSession(sid, next);
    set({ messages: next });
  },

  appendDelta: (delta: string) => {
    set((s) => ({
      streamingText: s.streamingText + delta,
      status: "streaming",
    }));
  },

  addToolCall: (toolCall: ToolCallEntry) => {
    set((s) => ({ toolCalls: [...s.toolCalls, toolCall] }));
  },

  updateToolCall: (id: string, update: Partial<ToolCallEntry>) => {
    set((s) => ({
      toolCalls: s.toolCalls.map((tc) =>
        tc.id === id ? { ...tc, ...update } : tc
      ),
    }));
  },

  clearStreaming: () => {
    const state = get();
    // Move streamed text into messages if non-empty
    if (state.streamingText) {
      const assistantMsg: AgentMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: state.streamingText,
        timestamp: Date.now(),
        toolCalls: state.toolCalls.length > 0 ? [...state.toolCalls] : undefined,
        runId: state.pendingRunId ?? undefined,
      };
      const next = [...state.messages, assistantMsg];
      if (state.sessionId) touchSession(state.sessionId, next);
      set({
        messages: next,
        streamingText: "",
        toolCalls: [],
        status: "idle",
        pendingRunId: null,
      });
    } else {
      set({
        streamingText: "",
        toolCalls: [],
        status: "idle",
        pendingRunId: null,
      });
    }
  },

  setPendingRunId: (runId: string) => {
    set({ pendingRunId: runId });
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
        messages: s.messages.map((msg) =>
          msg.runId === runId ? { ...msg, artifacts } : msg
        ),
      }));
    } catch {
      // silently ignore artifact fetch errors
    }
  },

  setSSEStatus: (sseStatus) => set({ sseStatus }),
  setSSERetryAttempt: (sseRetryAttempt) => set({ sseRetryAttempt }),
}));
