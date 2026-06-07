"use client";

import type { RuntimeEvent } from "@/lib/runtime/events";
import { useCallback, useEffect, useRef } from "react";

type SSEStatus = "disconnected" | "connected" | "reconnecting";

type RuntimeEventHandler = (event: RuntimeEvent) => void;

interface LRUSet {
  set: Set<string>;
  order: string[];
  add(id: string): boolean;
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

const INITIAL_BACKOFF = 1000;
const MAX_BACKOFF = 30000;
const DEDUP_CAPACITY = 500;

export interface UseSSEReturn {
  connect: (url: string, handler?: RuntimeEventHandler) => void;
  disconnect: () => void;
  getStatus: () => SSEStatus;
  onStatusChange: (cb: (status: SSEStatus) => void) => () => void;
  waitForConnection: () => Promise<void>;
}

/**
 * vNext SSE hook — subscribes only to "event: runtime.event".
 *
 * All events are parsed as RuntimeEvent and passed to the handler.
 * Native EventSource.onerror is treated as transport status change only.
 * Business errors come from event.type === "error.created".
 */
export function useSSE(): UseSSEReturn {
  const sourceRef = useRef<EventSource | null>(null);
  const statusRef = useRef<SSEStatus>("disconnected");
  const handlerRef = useRef<RuntimeEventHandler | null>(null);
  const urlRef = useRef<string>("");
  const backoffRef = useRef<number>(INITIAL_BACKOFF);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dedupRef = useRef<LRUSet>(createLRUSet(DEDUP_CAPACITY));
  const lastEventIdRef = useRef<string | null>(null);
  const listenersRef = useRef<Set<(s: SSEStatus) => void>>(new Set());
  const connectedResolversRef = useRef<Array<() => void>>([]);
  const doConnectRef = useRef<() => void>(() => {});

  const setStatus = useCallback((s: SSEStatus) => {
    if (statusRef.current === s) return;
    statusRef.current = s;
    for (const cb of listenersRef.current) {
      try {
        cb(s);
      } catch {
        /* swallow */
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
      doConnectRef.current();
    }, delay);
  }, [setStatus]);

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
      for (const resolve of connectedResolversRef.current) {
        resolve();
      }
      connectedResolversRef.current = [];
    };

    // Listen only to "runtime.event" — the single SSE event type
    es.addEventListener("runtime.event", ((event: MessageEvent) => {
      const data = typeof event.data === "string" ? event.data : null;
      if (data === null) return;

      if (event.lastEventId) {
        lastEventIdRef.current = event.lastEventId;
      }

      // Dedup by lastEventId or data hash
      const eventId = event.lastEventId || data;
      if (!dedupRef.current.add(eventId)) return;

      // Parse as RuntimeEvent and pass to handler
      try {
        const runtimeEvent = JSON.parse(data) as RuntimeEvent;
        if (handlerRef.current) {
          handlerRef.current(runtimeEvent);
        }
      } catch {
        // Ignore malformed events
      }
    }) as EventListener);

    // Native onerror is transport-only — just set status and reconnect
    es.onerror = () => {
      setStatus("disconnected");
      es.close();
      sourceRef.current = null;
      scheduleReconnect();
    };
  }, [cleanup, scheduleReconnect, setStatus]);

  useEffect(() => {
    doConnectRef.current = doConnect;
  }, [doConnect]);

  const disconnect = useCallback(() => {
    cleanup();
    setStatus("disconnected");
    backoffRef.current = INITIAL_BACKOFF;
    connectedResolversRef.current.length = 0;
  }, [cleanup, setStatus]);

  const connect = useCallback(
    (url: string, handler?: RuntimeEventHandler) => {
      disconnect();
      urlRef.current = url;
      handlerRef.current = handler ?? null;
      backoffRef.current = INITIAL_BACKOFF;
      lastEventIdRef.current = null;
      dedupRef.current = createLRUSet(DEDUP_CAPACITY);
      doConnect();
    },
    [disconnect, doConnect],
  );

  const getStatus = useCallback(() => statusRef.current, []);

  const waitForConnection = useCallback((): Promise<void> => {
    if (statusRef.current === "connected") return Promise.resolve();
    return new Promise((resolve) => {
      connectedResolversRef.current.push(resolve);
    });
  }, []);

  const onStatusChange = useCallback((cb: (status: SSEStatus) => void) => {
    listenersRef.current.add(cb);
    cb(statusRef.current);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return { connect, disconnect, getStatus, onStatusChange, waitForConnection };
}
