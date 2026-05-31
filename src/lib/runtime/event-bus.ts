/**
 * Event types that are persisted in the replay buffer.
 * Includes streaming events so reconnecting clients can catch up
 * on mid-stream content.  Buffer is capped at REPLAY_BUFFER_SIZE
 * per session so memory stays bounded.
 */
const STATE_EVENT_TYPES = new Set([
  "run.created",
  "run.updated",
  "artifact.created",
  "goal.set",
  "goal.achieved",
  "goal.abandoned",
  "goal.superseded",
  "error",
  // Streaming events — needed for mid-stream reconnect
  "text_delta",
  "tool_call",
  "tool_result",
]);

/** Maximum number of events kept per session in the replay buffer. */
const REPLAY_BUFFER_SIZE = 500;

/** Maximum number of session channels kept in memory. Oldest are evicted first. */
const MAX_CHANNELS = 50;

export interface BusEvent {
  id: number;
  sessionId: string;
  type: string;
  data: unknown;
  timestamp: string;
}

type Subscriber = (event: BusEvent) => void;

interface SessionChannel {
  /** Monotonically increasing event counter scoped to the session. */
  nextId: number;
  /** Ring buffer of state events for replay. */
  buffer: BusEvent[];
  /** Active subscribers for this session. */
  subscribers: Set<Subscriber>;
  /** Last activity timestamp for eviction. */
  lastActivity: number;
}

/**
 * In-memory, session-scoped event bus with replay support.
 *
 * Each session maintains an independent ring buffer of state events
 * (up to 500) so that SSE clients can catch up after reconnection.
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
   * Emit an event into a session channel.
   *
   * State events (as defined by STATE_EVENT_TYPES) are buffered for replay.
   * All events are delivered to active subscribers.
   */
  emit(sessionId: string, eventType: string, data: unknown): void {
    const channel = this.getOrCreateChannel(sessionId);
    // Only log state events — high-frequency streaming events (text_delta,
    // tool_call, tool_result) would flood stdout and cause memory pressure.
    if (STATE_EVENT_TYPES.has(eventType)) {
      console.log(
        `[EventBus] emit ${eventType} session=${sessionId} subs=${channel.subscribers.size}`,
      );
    }

    const event: BusEvent = {
      id: channel.nextId++,
      sessionId,
      type: eventType,
      data,
      timestamp: new Date().toISOString(),
    };

    // Buffer state events for replay
    if (STATE_EVENT_TYPES.has(eventType)) {
      channel.buffer.push(event);
      if (channel.buffer.length > REPLAY_BUFFER_SIZE) {
        channel.buffer.shift();
      }
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
      // If no subscribers remain and buffer is empty, remove channel to free memory
      if (channel.subscribers.size === 0 && channel.buffer.length === 0) {
        this.channels.delete(sessionId);
      }
    };
  }

  /**
   * Replay buffered state events whose id is greater than `lastEventId`.
   *
   * @returns Array of events in chronological order.
   */
  replay(sessionId: string, lastEventId: number): BusEvent[] {
    const channel = this.channels.get(sessionId);
    if (!channel) return [];

    return channel.buffer.filter((event) => event.id > lastEventId);
  }

  /**
   * Format an event as an SSE string suitable for a `text/event-stream` response.
   */
  toSSE(event: BusEvent): string {
    return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  }

  /**
   * Explicitly remove a session channel and clear its buffer.
   * Called when a session is deleted or a run is fully complete.
   */
  removeChannel(sessionId: string): void {
    this.channels.delete(sessionId);
  }
}

// ── Global singleton (survives Next.js dev server hot reloads) ──────
// Next.js dev mode may evaluate modules multiple times across separate
// bundles (RSC, SSR, API routes), creating duplicate singletons.
// Storing on globalThis ensures all bundles share the same instance.

const globalForEventBus = globalThis as unknown as {
  __eventBus: EventBus | undefined;
};

export const eventBus: EventBus = globalForEventBus.__eventBus ?? new EventBus();
if (!globalForEventBus.__eventBus) {
  console.log("[EventBus] NEW singleton created");
}
globalForEventBus.__eventBus = eventBus;
