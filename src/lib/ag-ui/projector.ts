/**
 * AG-UI Projector — converts RuntimeEvents to AG-UI BaseEvents.
 *
 * The projector maps internal canonical events to the standard AG-UI protocol
 * for external agent UIs and clients.
 */

import type { RuntimeEvent } from "@/lib/runtime/events";
import { EventType } from "@ag-ui/core";

export interface AgUiEvent {
  type: EventType;
  timestamp?: number;
  rawEvent?: unknown;
  [key: string]: unknown;
}

/**
 * Project a RuntimeEvent to an AG-UI event.
 *
 * Returns null for events that have no AG-UI projection
 * (e.g., transport events, internal data events).
 */
export function projectToAgUi(event: RuntimeEvent): AgUiEvent | null {
  const timestamp = new Date(event.createdAt).getTime();

  switch (event.type) {
    // ─── Run lifecycle ──────────────────────────────────────────────
    case "run.started":
      return {
        type: EventType.RUN_STARTED,
        timestamp,
        threadId: event.sessionId,
        runId: event.runId,
      };

    case "run.completed":
      return {
        type: EventType.RUN_FINISHED,
        timestamp,
        threadId: event.sessionId,
        runId: event.runId,
      };

    case "run.failed":
    case "run.cancelled":
      return {
        type: EventType.RUN_ERROR,
        timestamp,
        threadId: event.sessionId,
        runId: event.runId,
        error: event.payload,
      };

    case "error.created":
      return {
        type: EventType.RUN_ERROR,
        timestamp,
        threadId: event.sessionId,
        runId: event.runId,
        error: event.payload,
      };

    // ─── Model text streaming ───────────────────────────────────────
    case "model.text.started":
      return {
        type: EventType.TEXT_MESSAGE_START,
        timestamp,
        messageId: event.runId,
        role: "assistant",
      };

    case "model.text.delta":
      return {
        type: EventType.TEXT_MESSAGE_CONTENT,
        timestamp,
        messageId: event.runId,
        delta: (event.payload as { delta?: string })?.delta ?? "",
      };

    case "model.text.completed":
      return {
        type: EventType.TEXT_MESSAGE_END,
        timestamp,
        messageId: event.runId,
      };

    // ─── Reasoning ──────────────────────────────────────────────────
    case "model.reasoning.delta":
      return {
        type: EventType.REASONING_MESSAGE_CONTENT,
        timestamp,
        delta: (event.payload as { delta?: string })?.delta ?? "",
      };

    // ─── Tool calls ─────────────────────────────────────────────────
    case "tool.call.created":
      return {
        type: EventType.TOOL_CALL_START,
        timestamp,
        toolCallId: event.toolCallId,
        toolName: (event.payload as { name?: string })?.name ?? "unknown",
      };

    case "tool.call.args_delta":
      return {
        type: EventType.TOOL_CALL_ARGS,
        timestamp,
        toolCallId: event.toolCallId,
        delta: (event.payload as { delta?: string })?.delta ?? "",
      };

    case "tool.call.completed":
      return {
        type: EventType.TOOL_CALL_END,
        timestamp,
        toolCallId: event.toolCallId,
      };

    case "tool.call.started":
      return {
        type: EventType.TOOL_CALL_START,
        timestamp,
        toolCallId: event.toolCallId,
        toolName: (event.payload as { name?: string })?.name ?? "unknown",
      };

    case "tool.call.failed":
      return {
        type: EventType.RUN_ERROR,
        timestamp,
        error: event.payload,
      };

    // ─── Artifacts ──────────────────────────────────────────────────
    case "artifact.created":
      return {
        type: EventType.STATE_DELTA,
        timestamp,
        delta: {
          artifacts: [
            {
              id: event.artifactId,
              kind: (event.payload as { kind?: string })?.kind,
              name: (event.payload as { name?: string })?.name,
            },
          ],
        },
      };

    // ─── Goal updates ──────────────────────────────────────────────
    case "goal.updated":
      return {
        type: EventType.STATE_DELTA,
        timestamp,
        delta: event.payload,
      };

    // ─── Data source ───────────────────────────────────────────────
    case "data.source.selected":
    case "data.source.failed_over":
      return {
        type: EventType.CUSTOM,
        timestamp,
        name: event.type,
        value: event.payload,
      };

    // ─── No projection needed ──────────────────────────────────────
    case "transport.connected":
    case "transport.heartbeat":
    case "transport.disconnected":
    case "session.created":
    case "session.message.created":
    case "run.created":
    case "run.progressed":
    case "run.cancel_requested":
      return null;

    default:
      return null;
  }
}

/**
 * Project an array of RuntimeEvents to AG-UI events.
 * Filters out null projections.
 */
export function projectBatch(events: RuntimeEvent[]): AgUiEvent[] {
  return events.map(projectToAgUi).filter((e): e is AgUiEvent => e !== null);
}
