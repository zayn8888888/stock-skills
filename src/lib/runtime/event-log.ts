/**
 * RuntimeEventLog — append-only event log service.
 *
 * Responsibilities:
 * - Assign session-scoped monotonic seq numbers.
 * - Persist events to runtime_events table.
 * - Publish events to subscribers after persist.
 * - Buffer events for replay.
 */

import type { RuntimeStore } from "./store";
import type { RuntimeEvent } from "./events";

export type EventSubscriber = (event: RuntimeEvent) => void;

export class RuntimeEventLog {
  private subscribers = new Map<string, Set<EventSubscriber>>();
  private buffer = new Map<string, RuntimeEvent[]>();
  private maxBufferSize = 500;

  constructor(private store: RuntimeStore) {}

  /**
   * Append an event to the log.
   * Assigns session_seq (and optionally run_seq), persists, then publishes.
   * Returns the persisted event with assigned seq numbers.
   */
  async append<T>(event: RuntimeEvent<T>): Promise<RuntimeEvent<T>> {
    // Assign session-scoped seq
    const sessionSeq = await this.store.events.nextSessionSeq(event.sessionId);
    event.sessionSeq = sessionSeq;

    // Assign run-scoped seq if runId is present
    let runSeq: number | undefined;
    if (event.runId) {
      runSeq = await this.store.events.nextRunSeq(event.runId);
      event.runSeq = runSeq;
    }

    // Serialize payload for persistence
    const payloadJson = event.payload != null ? JSON.stringify(event.payload) : null;

    // Persist
    await this.store.events.append({
      id: event.id,
      schemaVersion: event.schemaVersion,
      sessionSeq: event.sessionSeq,
      runSeq: event.runSeq ?? null,
      scope: event.scope,
      type: event.type,
      category: event.category,
      sessionId: event.sessionId,
      runId: event.runId ?? null,
      messageId: event.messageId ?? null,
      toolCallId: event.toolCallId ?? null,
      artifactId: event.artifactId ?? null,
      parentEventId: event.parentEventId ?? null,
      correlationId: event.correlationId ?? null,
      idempotencyKey: event.idempotencyKey ?? null,
      producer: event.producer,
      visibility: event.visibility,
      persist: event.persist,
      payloadJson,
      createdAt: event.createdAt,
    });

    // Buffer for replay
    this.addToBuffer(event.sessionId, event);

    // Publish to subscribers
    this.publish(event.sessionId, event);

    return event;
  }

  /**
   * Subscribe to events for a session.
   * Returns an unsubscribe function.
   */
  subscribe(sessionId: string, handler: EventSubscriber): () => void {
    let subs = this.subscribers.get(sessionId);
    if (!subs) {
      subs = new Set();
      this.subscribers.set(sessionId, subs);
    }
    subs.add(handler);

    return () => {
      subs.delete(handler);
      if (subs.size === 0) {
        this.subscribers.delete(sessionId);
      }
    };
  }

  /**
   * Replay buffered events for a session, optionally after a given seq.
   */
  replay(sessionId: string, afterSeq?: number): RuntimeEvent[] {
    const buf = this.buffer.get(sessionId) ?? [];
    if (afterSeq != null) {
      return buf.filter((e) => e.sessionSeq > afterSeq);
    }
    return [...buf];
  }

  /**
   * Get the latest active run event buffer for a session.
   * Used for fresh SSE connections that need to recover running state.
   */
  replayActiveRun(sessionId: string): RuntimeEvent[] {
    const buf = this.buffer.get(sessionId) ?? [];
    // Find the most recent run.created or run.started and return events after it
    let activeRunStart = -1;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].type === "run.created" || buf[i].type === "run.started") {
        activeRunStart = i;
        break;
      }
    }
    if (activeRunStart === -1) return [];
    return buf.slice(activeRunStart);
  }

  private addToBuffer(sessionId: string, event: RuntimeEvent): void {
    let buf = this.buffer.get(sessionId);
    if (!buf) {
      buf = [];
      this.buffer.set(sessionId, buf);
    }
    buf.push(event);

    // Ring buffer: drop oldest if over limit
    while (buf.length > this.maxBufferSize) {
      buf.shift();
    }
  }

  private publish(sessionId: string, event: RuntimeEvent): void {
    const subs = this.subscribers.get(sessionId);
    if (!subs || subs.size === 0) return;

    for (const handler of subs) {
      try {
        handler(event);
      } catch (err) {
        console.error(`[EventLog] subscriber error for session ${sessionId}:`, err);
      }
    }
  }
}
