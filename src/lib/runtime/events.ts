/**
 * RuntimeEvent types and validators for the vNext canonical protocol.
 *
 * All state changes in the vNext runtime produce typed RuntimeEvents.
 * These events are persisted to runtime_events and published via EventBus.
 */

import { nanoid } from "nanoid";
import { z } from "zod";

// ─── Event type enumeration ──────────────────────────────────────────

export const RUNTIME_EVENT_TYPES = [
  // Session lifecycle
  "session.created",
  "session.message.created",
  // Run lifecycle
  "run.created",
  "run.started",
  "run.progressed",
  "run.completed",
  "run.failed",
  "run.cancel_requested",
  "run.cancelled",
  // Model streaming
  "model.text.started",
  "model.text.delta",
  "model.text.completed",
  "model.reasoning.delta",
  // Tool lifecycle
  "tool.call.created",
  "tool.call.args_delta",
  "tool.call.started",
  "tool.call.completed",
  "tool.call.failed",
  // Artifacts
  "artifact.created",
  // Data source
  "data.source.selected",
  "data.source.failed_over",
  // Error
  "error.created",
  // Transport (non-persisted)
  "transport.connected",
  "transport.heartbeat",
  "transport.disconnected",
  // System (for importer compatibility)
  "system.info",
  // Snapshot
  "runtime.snapshot",
] as const;

export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];

const RUNTIME_EVENT_TYPE_SET = new Set<string>(RUNTIME_EVENT_TYPES);

export function isValidRuntimeEventType(type: string): type is RuntimeEventType {
  return RUNTIME_EVENT_TYPE_SET.has(type);
}

// ─── Scope / category enums ──────────────────────────────────────────

export const RUNTIME_EVENT_SCOPES = [
  "session",
  "run",
  "tool",
  "artifact",
  "goal",
  "system",
] as const;

export const RUNTIME_EVENT_CATEGORIES = [
  "lifecycle",
  "message",
  "model",
  "tool",
  "artifact",
  "goal",
  "data",
  "error",
  "transport",
] as const;

export const RUNTIME_EVENT_PRODUCERS = ["server", "runner", "adapter", "ui", "system"] as const;

export const RUNTIME_EVENT_VISIBILITIES = ["ui", "internal", "audit"] as const;

// ─── Zod schema ──────────────────────────────────────────────────────

export const RuntimeEventSchema = z.object({
  id: z.string(),
  schemaVersion: z.literal("runtime-event.v1"),
  sessionSeq: z.number(),
  runSeq: z.number().nullable().optional(),
  scope: z.enum(RUNTIME_EVENT_SCOPES),
  type: z.string(),
  category: z.enum(RUNTIME_EVENT_CATEGORIES),
  sessionId: z.string(),
  runId: z.string().nullable().optional(),
  messageId: z.string().nullable().optional(),
  toolCallId: z.string().nullable().optional(),
  artifactId: z.string().nullable().optional(),
  parentEventId: z.string().nullable().optional(),
  correlationId: z.string().nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
  producer: z.enum(RUNTIME_EVENT_PRODUCERS),
  visibility: z.enum(RUNTIME_EVENT_VISIBILITIES),
  persist: z.number(),
  payloadJson: z.string().nullable().optional(),
  createdAt: z.string(),
  // Also accept parsed payload for in-memory use
  payload: z.unknown().optional(),
});

export type RuntimeEvent<T = unknown> = {
  id: string;
  schemaVersion: "runtime-event.v1";
  sessionSeq: number;
  runSeq?: number | null;
  scope: (typeof RUNTIME_EVENT_SCOPES)[number];
  type: string;
  category: (typeof RUNTIME_EVENT_CATEGORIES)[number];
  sessionId: string;
  runId?: string | null;
  messageId?: string | null;
  toolCallId?: string | null;
  artifactId?: string | null;
  parentEventId?: string | null;
  correlationId?: string | null;
  idempotencyKey?: string | null;
  producer: (typeof RUNTIME_EVENT_PRODUCERS)[number];
  visibility: (typeof RUNTIME_EVENT_VISIBILITIES)[number];
  persist: number;
  payloadJson?: string | null;
  createdAt: string;
  payload?: T;
};

// ─── Factory ─────────────────────────────────────────────────────────

export interface CreateRuntimeEventInput<T = unknown> {
  sessionId: string;
  runId?: string;
  messageId?: string;
  toolCallId?: string;
  artifactId?: string;
  parentEventId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  type: string;
  category: (typeof RUNTIME_EVENT_CATEGORIES)[number];
  payload: T;
  scope?: (typeof RUNTIME_EVENT_SCOPES)[number];
  producer?: (typeof RUNTIME_EVENT_PRODUCERS)[number];
  visibility?: (typeof RUNTIME_EVENT_VISIBILITIES)[number];
  persist?: number;
}

/**
 * Create a RuntimeEvent with sensible defaults.
 * sessionSeq and runSeq are assigned by RuntimeEventLog.append() when persisted.
 */
export function createRuntimeEvent<T = unknown>(
  input: CreateRuntimeEventInput<T>,
): RuntimeEvent<T> {
  return {
    id: nanoid(),
    schemaVersion: "runtime-event.v1",
    sessionSeq: 0, // assigned by event log
    scope: input.scope ?? "run",
    type: input.type,
    category: input.category,
    sessionId: input.sessionId,
    runId: input.runId ?? null,
    messageId: input.messageId ?? null,
    toolCallId: input.toolCallId ?? null,
    artifactId: input.artifactId ?? null,
    parentEventId: input.parentEventId ?? null,
    correlationId: input.correlationId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    producer: input.producer ?? "server",
    visibility: input.visibility ?? "ui",
    persist: input.persist ?? 1,
    createdAt: new Date().toISOString(),
    payload: input.payload,
  };
}
