/**
 * Event types that are persisted in the replay buffer.
 * High-frequency streaming events (text_delta, tool_call, tool_result)
 * are intentionally excluded to keep the buffer manageable.
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
]);

/** Maximum number of events kept per session in the replay buffer. */
const REPLAY_BUFFER_SIZE = 500;

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
      channel = { nextId: 1, buffer: [], subscribers: new Set() };
      this.channels.set(sessionId, channel);
    }
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
}

/** Global singleton event bus. */
export const eventBus = new EventBus();
