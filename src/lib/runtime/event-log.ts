/**
 * RuntimeEventLog — append-only event log service.
 *
 * Responsibilities:
 * - Assign session-scoped monotonic seq numbers.
 * - Persist events to runtime_events table.
 * - Publish events to subscribers after persist.
 * - Buffer events for replay.
 */

import type { RuntimeEvent } from "./events";
import type { RuntimeStore, RuntimeStoreTx } from "./store";

export type EventSubscriber = (event: RuntimeEvent) => void;

export interface RuntimeEventLogOptions {
  /** Called after each event is persisted and buffered. Use to bridge to external buses. */
  onAppend?: (event: RuntimeEvent) => void;
}

export class RuntimeEventLog {
  private subscribers = new Map<string, Set<EventSubscriber>>();
  private buffer = new Map<string, RuntimeEvent[]>();
  private maxBufferSize = 500;
  private onAppend?: (event: RuntimeEvent) => void;

  constructor(
    private store: RuntimeStore,
    options?: RuntimeEventLogOptions,
  ) {
    this.onAppend = options?.onAppend;
  }

  /**
   * Append an event to the log.
   * Assigns session_seq (and optionally run_seq), persists, then publishes.
   * Returns the persisted event with assigned seq numbers.
   */
  async append<T>(event: RuntimeEvent<T>): Promise<RuntimeEvent<T>> {
    // Serialize payload outside the transaction (pure CPU, no DB)
    const payloadJson = event.payload != null ? JSON.stringify(event.payload) : null;

    // Atomic: seq assignment + insert in a single transaction.
    // This prevents duplicate seq values from concurrent appends to the same session.
    const persisted = await this.store.transaction(async (tx) => {
      // Assign session-scoped seq
      const sessionSeq = await tx.events.nextSessionSeq(event.sessionId);
      event.sessionSeq = sessionSeq;

      // Assign run-scoped seq if runId is present
      if (event.runId) {
        event.runSeq = await tx.events.nextRunSeq(event.runId);
      }

      // Persist
      await tx.events.append({
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

      await this.projectReadModels(tx, event);

      return event;
    });

    // Buffer for replay (in-memory, after transaction commits)
    this.addToBuffer(persisted.sessionId, persisted);

    // Publish to subscribers (in-memory, after transaction commits)
    this.publish(persisted.sessionId, persisted);

    // Notify external bridge (e.g. EventBus for SSE delivery)
    this.onAppend?.(persisted);

    return persisted;
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

  private async projectReadModels(tx: RuntimeStoreTx, event: RuntimeEvent): Promise<void> {
    const payload = toRecord(event.payload);

    if (event.type === "model.text.completed" && event.runId) {
      const text = typeof payload.text === "string" ? payload.text : "";
      const existing = await tx.messages.findByRun(event.runId);
      const hasFinalMessage = existing.some(
        (message) => message.role === "assistant" && message.messageType === "assistant_final",
      );

      if (!hasFinalMessage) {
        await tx.messages.create({
          ...(event.messageId ? { id: event.messageId } : {}),
          sessionId: event.sessionId,
          runId: event.runId,
          role: "assistant",
          messageType: "assistant_final",
          content: text,
          createdAt: event.createdAt,
          updatedAt: event.createdAt,
        });
      }
    }

    if (event.type === "error.created" || event.type === "run.failed") {
      const existing = event.runId ? await tx.messages.findByRun(event.runId) : [];
      const hasProjectedError =
        existing.some((message) => message.messageType === "error") ||
        (event.runId == null && (await tx.messages.findById(event.id)) != null);

      if (!hasProjectedError) {
        const message = stringValue(payload.message, "Unknown error");
        await tx.messages.create({
          id: event.id,
          sessionId: event.sessionId,
          runId: event.runId ?? null,
          role: "system",
          messageType: "error",
          content: message.startsWith("Error:") ? message : `Error: ${message}`,
          createdAt: event.createdAt,
          updatedAt: event.createdAt,
        });
      }
    }

    if (event.type === "tool.call.created" && event.runId && event.toolCallId) {
      const existing = await tx.tools.findById(event.toolCallId);
      if (!existing) {
        await tx.tools.create({
          id: event.toolCallId,
          sessionId: event.sessionId,
          runId: event.runId,
          name: stringValue(payload.name, "unknown"),
          status: "running",
          argsJson: jsonValue(payload.args),
          createdEventId: event.id,
          startedAt: event.createdAt,
          createdAt: event.createdAt,
          updatedAt: event.createdAt,
        });
      }
    }

    if (
      (event.type === "tool.call.completed" || event.type === "tool.call.failed") &&
      event.runId &&
      event.toolCallId
    ) {
      const existing = await tx.tools.findById(event.toolCallId);
      if (!existing) {
        await tx.tools.create({
          id: event.toolCallId,
          sessionId: event.sessionId,
          runId: event.runId,
          name: stringValue(payload.name, "unknown"),
          status: "running",
          createdAt: event.createdAt,
          updatedAt: event.createdAt,
        });
      }

      if (event.type === "tool.call.completed") {
        const result = payload.result;
        await tx.tools.updateStatus(event.toolCallId, stringValue(payload.status, "succeeded"), {
          resultJson: jsonValue(result),
          resultText: typeof result === "string" ? result : undefined,
          finishedAt: event.createdAt,
        });
      } else {
        await tx.tools.updateStatus(event.toolCallId, "failed", {
          errorCode: "tool.failed",
          errorMessage: stringValue(payload.error, "Tool call failed"),
          finishedAt: event.createdAt,
        });
      }
    }

    if (event.type === "artifact.created" && event.runId && event.artifactId) {
      const existing = await tx.artifacts.findById(event.artifactId);
      if (!existing) {
        const content = typeof payload.content === "string" ? payload.content : undefined;
        await tx.artifacts.create({
          id: event.artifactId,
          sessionId: event.sessionId,
          runId: event.runId,
          kind: stringValue(payload.kind, "artifact"),
          name: stringValue(payload.name, event.artifactId),
          inlineContent: content,
          content,
          producer: event.producer,
          sourceEventId: event.id,
          createdAt: event.createdAt,
        });
      }
    }

    if (
      event.runId &&
      (event.type === "run.completed" ||
        event.type === "run.failed" ||
        event.type === "run.cancelled")
    ) {
      const session = await tx.sessions.findById(event.sessionId);
      if (session?.activeRunId === event.runId) {
        await tx.sessions.setActiveRun(event.sessionId, null);
      }
    }
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function jsonValue(value: unknown): string | undefined {
  return value === undefined ? undefined : JSON.stringify(value);
}
