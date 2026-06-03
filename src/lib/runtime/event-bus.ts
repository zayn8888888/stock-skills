/**
 * Typed, session-scoped event bus with replay support.
 *
 * The vNext EventBus accepts only RuntimeEvent objects (canonical protocol).
 * Old string-based event names (text_delta, tool_call, etc.) are NOT supported.
 *
 * Each session maintains an independent ring buffer of runtime events
 * (up to REPLAY_BUFFER_SIZE) so SSE clients can catch up after reconnection.
 */

import type { RuntimeEvent } from "./events";

// ─── Terminal run event types ─────────────────────────────────────────

const TERMINAL_RUN_TYPES = new Set([
  "run.completed",
  "run.failed",
  "run.cancelled",
]);

/** Maximum number of events kept per session in the replay buffer. */
const REPLAY_BUFFER_SIZE = 500;

/** Maximum number of session channels kept in memory. Oldest are evicted first. */
const MAX_CHANNELS = 50;

type Subscriber = (event: RuntimeEvent) => void;

interface SessionChannel {
  /** Monotonically increasing event counter scoped to the session. */
  nextId: number;
  /** Ring buffer of runtime events for replay. */
  buffer: RuntimeEvent[];
  /** Active subscribers for this session. */
  subscribers: Set<Subscriber>;
  /** Last activity timestamp for eviction. */
  lastActivity: number;
}

/**
 * In-memory, session-scoped event bus with replay support.
 *
 * Accepts only typed RuntimeEvent objects. Old string event names are rejected.
 */
export class EventBus {
  private channels = new Map<string, SessionChannel>();

  private getOrCreateChannel(sessionId: string): SessionChannel {
    let channel = this.channels.get(sessionId);
    if (!channel) {
      // Evict oldest channel if at capacity
      if (this.channels.size >= MAX_CHANNELS) {
        let oldestKey: string | null = null;
        let oldestTime = Number.POSITIVE_INFINITY;
        for (const [key, ch] of this.channels) {
          if (ch.lastActivity < oldestTime && ch.subscribers.size === 0) {
            oldestTime = ch.lastActivity;
            oldestKey = key;
          }
        }
        if (oldestKey) this.channels.delete(oldestKey);
      }
      channel = { nextId: 1, buffer: [], subscribers: new Set(), lastActivity: Date.now() };
      this.channels.set(sessionId, channel);
    }
    channel.lastActivity = Date.now();
    return channel;
  }

  /**
   * Emit a RuntimeEvent into a session channel.
   *
   * Non-persisted transport events (heartbeat, connected) are still buffered
   * for SSE replay but not to DB. All events are delivered to active subscribers.
   */
  emit(sessionId: string, event: RuntimeEvent): void {
    const channel = this.getOrCreateChannel(sessionId);
    // Assign bus-level id for SSE id field
    const busEvent = { ...event, _busId: channel.nextId++ };

    console.log(
      `[EventBus] emit ${event.type} session=${sessionId} seq=${event.sessionSeq} subs=${channel.subscribers.size}`,
    );

    // Buffer for replay
    channel.buffer.push(event);
    if (channel.buffer.length > REPLAY_BUFFER_SIZE) {
      channel.buffer.shift();
    }

    // Deliver to live subscribers
    for (const subscriber of channel.subscribers) {
      try {
        subscriber(event);
      } catch {
        // Swallow subscriber errors to protect the bus
      }
    }
  }

  /**
   * Subscribe to events in a session channel.
   *
   * @returns An unsubscribe function.
   */
  subscribe(sessionId: string, callback: Subscriber): () => void {
    const channel = this.getOrCreateChannel(sessionId);
    channel.subscribers.add(callback);

    return () => {
      channel.subscribers.delete(callback);
      if (channel.subscribers.size === 0 && channel.buffer.length === 0) {
        this.channels.delete(sessionId);
      }
    };
  }

  /**
   * Replay buffered events whose sessionSeq is greater than `afterSeq`.
   *
   * @returns Array of events in chronological order.
   */
  replay(sessionId: string, afterSeq: number): RuntimeEvent[] {
    const channel = this.channels.get(sessionId);
    if (!channel) return [];

    return channel.buffer.filter((event) => event.sessionSeq > afterSeq);
  }

  /**
   * Replay the latest non-terminal run for a fresh client.
   *
   * Browser reloads and route changes create a brand-new EventSource with no
   * Last-Event-ID. In that case we still want to restore the in-progress
   * stream, but we must not replay completed streams that already have a
   * persisted assistant message.
   */
  replayActiveRun(sessionId: string): RuntimeEvent[] {
    const channel = this.channels.get(sessionId);
    if (!channel) return [];

    for (let i = channel.buffer.length - 1; i >= 0; i--) {
      const event = channel.buffer[i];

      // Check if this run is terminal
      if (TERMINAL_RUN_TYPES.has(event.type)) {
        return []; // Last run is terminal — no active run
      }

      if (event.type === "run.created" || event.type === "run.started") {
        return channel.buffer.slice(i);
      }
    }

    return [];
  }

  /**
   * Format a RuntimeEvent as an SSE string suitable for text/event-stream.
   *
   * Uses "event: runtime.event" as the SSE event name — all vNext events
   * use this single event type. Old event names are NOT emitted.
   */
  toSSE(event: RuntimeEvent): string {
    return `id: ${event.sessionSeq}\nevent: runtime.event\ndata: ${JSON.stringify(event)}\n\n`;
  }

  /**
   * Explicitly remove a session channel and clear its buffer.
   */
  removeChannel(sessionId: string): void {
    this.channels.delete(sessionId);
  }
}

// ── Global singleton (survives Next.js dev server hot reloads) ──────

const globalForEventBus = globalThis as unknown as {
  __eventBus: EventBus | undefined;
};

function isCompatibleEventBus(value: unknown): value is EventBus {
  const candidate = value as Partial<EventBus> | undefined;
  return (
    typeof candidate?.emit === "function" &&
    typeof candidate.replay === "function" &&
    typeof candidate.replayActiveRun === "function" &&
    typeof candidate.subscribe === "function" &&
    typeof candidate.toSSE === "function"
  );
}

export const eventBus: EventBus = isCompatibleEventBus(globalForEventBus.__eventBus)
  ? globalForEventBus.__eventBus
  : new EventBus();
if (!isCompatibleEventBus(globalForEventBus.__eventBus)) {
  console.log("[EventBus] NEW singleton created");
}
globalForEventBus.__eventBus = eventBus;
