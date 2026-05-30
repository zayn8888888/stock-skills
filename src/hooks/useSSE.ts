"use client";

import { useCallback, useEffect, useRef } from "react";

type SSEStatus = "disconnected" | "connected" | "reconnecting";

type HandlerMap = Record<string, (data: string) => void>;

interface LRUSet {
  set: Set<string>;
  order: string[];
  add(id: string): boolean; // returns true if new
}

function createLRUSet(capacity: number): LRUSet {
  return {
    set: new Set(),
    order: [],
    add(id: string): boolean {
      if (this.set.has(id)) return false;
      if (this.order.length >= capacity) {
        const evicted = this.order.shift();
        if (evicted !== undefined) this.set.delete(evicted);
      }
      this.set.add(id);
      this.order.push(id);
      return true;
    },
  };
}

const INITIAL_BACKOFF = 1000; // 1s
const MAX_BACKOFF = 30000; // 30s
const DEDUP_CAPACITY = 500;

export interface UseSSEReturn {
  connect: (url: string, handlers?: HandlerMap) => void;
  disconnect: () => void;
  getStatus: () => SSEStatus;
  onStatusChange: (cb: (status: SSEStatus) => void) => () => void;
}

export function useSSE(): UseSSEReturn {
  const sourceRef = useRef<EventSource | null>(null);
  const statusRef = useRef<SSEStatus>("disconnected");
  const handlersRef = useRef<HandlerMap>({});
  const urlRef = useRef<string>("");
  const backoffRef = useRef<number>(INITIAL_BACKOFF);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dedupRef = useRef<LRUSet>(createLRUSet(DEDUP_CAPACITY));
  const lastEventIdRef = useRef<string | null>(null);
  const listenersRef = useRef<Set<(s: SSEStatus) => void>>(new Set());

  const setStatus = useCallback((s: SSEStatus) => {
    if (statusRef.current === s) return;
    statusRef.current = s;
    for (const cb of listenersRef.current) {
      try {
        cb(s);
      } catch {
        // swallow listener errors
      }
    }
  }, []);

  const cleanup = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    const delay = backoffRef.current;
    backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
    setStatus("reconnecting");
    retryTimerRef.current = setTimeout(() => {
      doConnect();
    }, delay);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doConnect = useCallback(() => {
    cleanup();

    let url = urlRef.current;
    if (lastEventIdRef.current) {
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}lastEventId=${encodeURIComponent(lastEventIdRef.current)}`;
    }

    const es = new EventSource(url);
    sourceRef.current = es;

    es.onopen = () => {
      backoffRef.current = INITIAL_BACKOFF;
      setStatus("connected");
    };

    es.onmessage = (event: MessageEvent) => {
      if (event.lastEventId) {
        lastEventIdRef.current = event.lastEventId;
      }
      const eventId = event.lastEventId || event.data;
      if (!dedupRef.current.add(eventId)) {
        return; // duplicate, skip
      }
      const handlers = handlersRef.current;
      if (handlers["message"]) {
        handlers["message"](event.data);
      }
    };

    es.onerror = () => {
      setStatus("disconnected");
      es.close();
      sourceRef.current = null;
      scheduleReconnect();
    };

    // Register named event handlers
    for (const eventName of Object.keys(handlersRef.current)) {
      if (eventName === "message") continue; // already handled via onmessage
      es.addEventListener(eventName, ((event: MessageEvent) => {
        if (event.lastEventId) {
          lastEventIdRef.current = event.lastEventId;
        }
        const eventId = event.lastEventId || event.data;
        if (!dedupRef.current.add(eventId)) {
          return;
        }
        const handler = handlersRef.current[eventName];
        if (handler) handler(event.data);
      }) as EventListener);
    }
  }, [cleanup, scheduleReconnect, setStatus]);

  const connect = useCallback(
    (url: string, handlers?: HandlerMap) => {
      disconnect();
      urlRef.current = url;
      handlersRef.current = handlers ?? {};
      backoffRef.current = INITIAL_BACKOFF;
      lastEventIdRef.current = null;
      dedupRef.current = createLRUSet(DEDUP_CAPACITY);
      doConnect();
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const disconnect = useCallback(() => {
    cleanup();
    setStatus("disconnected");
    backoffRef.current = INITIAL_BACKOFF;
  }, [cleanup, setStatus]);

  const getStatus = useCallback(() => statusRef.current, []);

  const onStatusChange = useCallback(
    (cb: (status: SSEStatus) => void) => {
      listenersRef.current.add(cb);
      // Fire immediately with current status
      cb(statusRef.current);
      return () => {
        listenersRef.current.delete(cb);
      };
    },
    []
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Workaround: keep connect/disconnect stable while doConnect references them.
  // We bind them imperatively via refs to avoid circular deps.
  const connectRef = useRef(connect);
  connectRef.current = connect;
  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;

  return { connect, disconnect, getStatus, onStatusChange };
}
