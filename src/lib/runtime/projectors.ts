/**
 * Runtime event projectors — format RuntimeEvents for various outputs.
 *
 * - formatSse: SSE text/event-stream encoding
 * - formatHeartbeat: transport heartbeat SSE line
 */

import type { RuntimeEvent } from "./events";

/**
 * Format a RuntimeEvent as an SSE string.
 *
 * All vNext events use "event: runtime.event" as the SSE event name.
 * The event id uses sessionSeq for client-side dedup/replay.
 */
export function formatSse(event: RuntimeEvent): string {
  return `id: ${event.sessionSeq}\nevent: runtime.event\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Format a transport heartbeat as an SSE string.
 * Uses sessionSeq 0 as a sentinel — heartbeats are not persisted.
 */
export function formatHeartbeat(sessionId: string, seq: number): string {
  const event: RuntimeEvent = {
    id: `heartbeat_${seq}`,
    schemaVersion: "runtime-event.v1",
    sessionSeq: seq,
    scope: "system",
    type: "transport.heartbeat",
    category: "transport",
    sessionId,
    producer: "server",
    visibility: "internal",
    persist: 0,
    payloadJson: null,
    createdAt: new Date().toISOString(),
  };
  return formatSse(event);
}

/**
 * Format a transport.connected event as an SSE string.
 */
export function formatConnected(sessionId: string): string {
  const event: RuntimeEvent = {
    id: `connected_${Date.now()}`,
    schemaVersion: "runtime-event.v1",
    sessionSeq: 0,
    scope: "system",
    type: "transport.connected",
    category: "transport",
    sessionId,
    producer: "server",
    visibility: "internal",
    persist: 0,
    payloadJson: null,
    createdAt: new Date().toISOString(),
  };
  return formatSse(event);
}
