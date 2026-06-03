/**
 * Canonical client-side reducer for the vNext runtime.
 *
 * Accepts only typed RuntimeEvent objects and produces normalized state.
 * Old event names (text_delta, tool_call, run.updated) are rejected.
 */

import type { RuntimeEvent } from "@/lib/runtime/events";

// ─── State shape ─────────────────────────────────────────────────────

export interface RuntimeState {
  messagesById: Record<string, RuntimeMessage>;
  messageOrder: string[];
  runsById: Record<string, RuntimeRun>;
  activeRunId: string | null;
  toolCallsById: Record<string, RuntimeToolCall>;
  artifactsByRunId: Record<string, RuntimeArtifact[]>;
  streamByRunId: Record<string, RuntimeStreamBuffer>;
  connection: RuntimeConnectionState;
}

export interface RuntimeMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  runId: string | null;
  createdAt: string;
}

export interface RuntimeRun {
  id: string;
  status: string;
  skillName?: string;
  ticker?: string;
  createdAt: string;
  finishedAt?: string;
}

export interface RuntimeToolCall {
  id: string;
  runId: string;
  name: string;
  status: string;
  args?: unknown;
  result?: unknown;
  createdAt: string;
}

export interface RuntimeArtifact {
  id: string;
  runId: string;
  kind: string;
  name: string;
  path?: string;
}

export interface RuntimeStreamBuffer {
  text: string;
  reasoningSummary: string;
}

export interface RuntimeConnectionState {
  status: "disconnected" | "connected" | "reconnecting";
  lastHeartbeatAt?: string;
}

// ─── Initial state ───────────────────────────────────────────────────

export function createInitialState(): RuntimeState {
  return {
    messagesById: {},
    messageOrder: [],
    runsById: {},
    activeRunId: null,
    toolCallsById: {},
    artifactsByRunId: {},
    streamByRunId: {},
    connection: { status: "disconnected" },
  };
}

// ─── Reducer ─────────────────────────────────────────────────────────

/**
 * Apply a canonical RuntimeEvent to the state.
 *
 * Returns the next immutable state.
 * Throws if the event type is unknown (rejects old event names).
 */
export function applyRuntimeEvent(state: RuntimeState, event: RuntimeEvent): RuntimeState {
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  switch (event.type) {
    // ─── Session message ──────────────────────────────────────────
    case "session.message.created": {
      const msgId = (payload.messageId as string) ?? event.messageId ?? event.id;
      const msg: RuntimeMessage = {
        id: msgId,
        role: (payload.role as string as RuntimeMessage["role"]) ?? "assistant",
        content: (payload.content as string) ?? "",
        runId: event.runId ?? null,
        createdAt: event.createdAt,
      };
      return {
        ...state,
        messagesById: { ...state.messagesById, [msgId]: msg },
        messageOrder: state.messageOrder.includes(msgId)
          ? state.messageOrder
          : [...state.messageOrder, msgId],
      };
    }

    // ─── Run lifecycle ────────────────────────────────────────────
    case "run.created": {
      const runId = (payload.runId as string) ?? event.runId ?? event.id;
      const run: RuntimeRun = {
        id: runId,
        status: "queued",
        skillName: payload.skillName as string | undefined,
        ticker: payload.ticker as string | undefined,
        createdAt: event.createdAt,
      };
      return {
        ...state,
        runsById: { ...state.runsById, [runId]: run },
        activeRunId: runId,
      };
    }

    case "run.started": {
      const runId = event.runId ?? "";
      const existing = state.runsById[runId];
      if (!existing) return state;
      return {
        ...state,
        runsById: {
          ...state.runsById,
          [runId]: { ...existing, status: "running" },
        },
        activeRunId: runId,
      };
    }

    case "run.completed":
    case "run.failed":
    case "run.cancelled": {
      const runId = event.runId ?? "";
      const existing = state.runsById[runId];
      if (!existing) return state;
      const status =
        event.type === "run.completed"
          ? "succeeded"
          : event.type === "run.failed"
            ? "failed"
            : "cancelled";

      // Move stream text to final message if there was streaming content
      const stream = state.streamByRunId[runId];
      const newState: RuntimeState = {
        ...state,
        runsById: {
          ...state.runsById,
          [runId]: { ...existing, status, finishedAt: event.createdAt },
        },
        activeRunId: state.activeRunId === runId ? null : state.activeRunId,
      };

      // If there was streamed text and no assistant message was created yet, create one
      if (stream?.text) {
        const msgId = `assistant_${runId}`;
        if (!state.messagesById[msgId]) {
          newState.messagesById = {
            ...newState.messagesById,
            [msgId]: {
              id: msgId,
              role: "assistant",
              content: stream.text,
              runId,
              createdAt: event.createdAt,
            },
          };
          if (!newState.messageOrder.includes(msgId)) {
            newState.messageOrder = [...newState.messageOrder, msgId];
          }
        }
        // Clear the stream buffer
        const newStreams = { ...newState.streamByRunId };
        delete newStreams[runId];
        newState.streamByRunId = newStreams;
      }

      return newState;
    }

    // ─── Model text streaming ─────────────────────────────────────
    case "model.text.started": {
      const runId = event.runId ?? "";
      const existing = state.streamByRunId[runId];
      if (existing) return state;
      return {
        ...state,
        streamByRunId: {
          ...state.streamByRunId,
          [runId]: { text: "", reasoningSummary: "" },
        },
      };
    }

    case "model.text.delta": {
      const runId = event.runId ?? "";
      const delta = (payload.delta as string) ?? "";
      const existing = state.streamByRunId[runId];
      return {
        ...state,
        streamByRunId: {
          ...state.streamByRunId,
          [runId]: {
            text: (existing?.text ?? "") + delta,
            reasoningSummary: existing?.reasoningSummary ?? "",
          },
        },
      };
    }

    case "model.text.completed": {
      // Stream complete — text will be finalized on run.completed
      return state;
    }

    case "model.reasoning.delta": {
      const runId = event.runId ?? "";
      const delta = (payload.delta as string) ?? "";
      const existing = state.streamByRunId[runId];
      return {
        ...state,
        streamByRunId: {
          ...state.streamByRunId,
          [runId]: {
            text: existing?.text ?? "",
            reasoningSummary: (existing?.reasoningSummary ?? "") + delta,
          },
        },
      };
    }

    // ─── Tool calls ───────────────────────────────────────────────
    case "tool.call.created": {
      const toolCallId = event.toolCallId ?? (payload.toolCallId as string) ?? event.id;
      const tc: RuntimeToolCall = {
        id: toolCallId,
        runId: event.runId ?? "",
        name: (payload.name as string) ?? "unknown",
        status: "running",
        args: payload.args,
        createdAt: event.createdAt,
      };
      return {
        ...state,
        toolCallsById: { ...state.toolCallsById, [toolCallId]: tc },
      };
    }

    case "tool.call.completed": {
      const toolCallId = event.toolCallId ?? (payload.toolCallId as string) ?? "";
      const existing = state.toolCallsById[toolCallId];
      if (!existing) return state;
      return {
        ...state,
        toolCallsById: {
          ...state.toolCallsById,
          [toolCallId]: {
            ...existing,
            status: "completed",
            result: payload.result,
          },
        },
      };
    }

    case "tool.call.failed": {
      const toolCallId = event.toolCallId ?? (payload.toolCallId as string) ?? "";
      const existing = state.toolCallsById[toolCallId];
      if (!existing) return state;
      return {
        ...state,
        toolCallsById: {
          ...state.toolCallsById,
          [toolCallId]: { ...existing, status: "error" },
        },
      };
    }

    // ─── Artifacts ────────────────────────────────────────────────
    case "artifact.created": {
      const artifactId = event.artifactId ?? (payload.artifactId as string) ?? event.id;
      const runId = event.runId ?? "";
      const artifact: RuntimeArtifact = {
        id: artifactId,
        runId,
        kind: (payload.kind as string) ?? "raw",
        name: (payload.name as string) ?? "artifact",
        path: payload.path as string | undefined,
      };
      const existing = state.artifactsByRunId[runId] ?? [];
      return {
        ...state,
        artifactsByRunId: {
          ...state.artifactsByRunId,
          [runId]: [...existing, artifact],
        },
      };
    }

    // ─── Error ────────────────────────────────────────────────────
    case "error.created": {
      const errMsg: RuntimeMessage = {
        id: event.id,
        role: "system",
        content: `Error: ${(payload.message as string) ?? "Unknown error"}`,
        runId: event.runId ?? null,
        createdAt: event.createdAt,
      };
      return {
        ...state,
        messagesById: { ...state.messagesById, [event.id]: errMsg },
        messageOrder: [...state.messageOrder, event.id],
      };
    }

    // ─── Transport ────────────────────────────────────────────────
    case "transport.connected":
      return {
        ...state,
        connection: { status: "connected", lastHeartbeatAt: event.createdAt },
      };

    case "transport.heartbeat":
      return {
        ...state,
        connection: { ...state.connection, lastHeartbeatAt: event.createdAt },
      };

    case "transport.disconnected":
      return {
        ...state,
        connection: { status: "disconnected" },
      };

    default:
      // Reject unknown event types — old event names should never reach here
      throw new Error(`[runtime-reducer] Unknown event type: ${event.type}`);
  }
}
