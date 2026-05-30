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
      };
      const next = [...state.messages, assistantMsg];
      if (state.sessionId) touchSession(state.sessionId, next);
      set({
        messages: next,
        streamingText: "",
        toolCalls: [],
        status: "idle",
      });
    } else {
      set({
        streamingText: "",
        toolCalls: [],
        status: "idle",
      });
    }
  },

  setSSEStatus: (sseStatus) => set({ sseStatus }),
  setSSERetryAttempt: (sseRetryAttempt) => set({ sseRetryAttempt }),
}));
