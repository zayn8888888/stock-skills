"use client";

import { Composer, type ComposerContext } from "@/components/research/Composer";
import { ContextChips, type ContextChipsData } from "@/components/research/ContextChips";
import { Timeline } from "@/components/research/Timeline";
import { WelcomeScreen } from "@/components/research/WelcomeScreen";
import { useLanguage } from "@/hooks/useLanguage";
import { useSSE } from "@/hooks/useSSE";
import { authFetch } from "@/lib/api/auth-fetch";
import { buildMessageContext } from "@/lib/research/message-context";
import type { RuntimeEvent } from "@/lib/runtime/events";
import { useAgentStore } from "@/stores/agent";
import { FileText, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const LABELS = {
  en: {
    title: "Research Desk",
    fallbackError: "Request failed",
    errorPrefix: "Error",
    processing: "Processing...",
  },
  zh: {
    title: "研究工作台",
    fallbackError: "请求失败",
    errorPrefix: "错误",
    processing: "处理中...",
  },
} as const;

export default function Home() {
  const {
    sessionId,
    sessionLoading,
    switchSession,
    loadTimeline,
    addRuntimeEvent,
    setSSEStatus,
    syncFromServer,
  } = useAgentStore();

  // Use selectors for rendering
  const messages = useAgentStore((s) => s.messages());
  const streamingText = useAgentStore((s) => s.streamingText());
  const streamingThinking = useAgentStore((s) => s.streamingThinking());
  const toolCalls = useAgentStore((s) => s.toolCalls());
  const pendingRunId = useAgentStore((s) => s.pendingRunId());

  const status = pendingRunId ? "streaming" : "idle";

  const { connect, disconnect, onStatusChange } = useSSE();
  const { language } = useLanguage();
  const labels = LABELS[language];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [composerContext, setComposerContext] = useState<ComposerContext>({});
  const [requestPending, setRequestPending] = useState(false);
  const skipNextHistoryLoad = useRef(false);

  // Ref to hold latest store functions
  const storeFnsRef = useRef({
    addRuntimeEvent,
    syncFromServer,
    setRequestPending: (v: boolean) => setRequestPending(v),
  });
  storeFnsRef.current = {
    addRuntimeEvent,
    syncFromServer,
    setRequestPending: (v: boolean) => setRequestPending(v),
  };

  // ---------------------------------------------------------------------------
  // SSE connection — subscribe to canonical "runtime.event"
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!sessionId) {
      disconnect();
      return;
    }

    const handler = (event: RuntimeEvent) => {
      storeFnsRef.current.addRuntimeEvent(event);

      // Handle terminal run events
      if (
        event.type === "run.completed" ||
        event.type === "run.failed" ||
        event.type === "run.cancelled"
      ) {
        storeFnsRef.current.setRequestPending(false);
        window.dispatchEvent(new Event("stock-skills:sessions-updated"));
        // Sync from server to get final DB state
        const currentSessionId = sessionId;
        if (currentSessionId) {
          setTimeout(() => storeFnsRef.current.syncFromServer(currentSessionId), 500);
        }
      }

      // Handle error events
      if (event.type === "error.created") {
        storeFnsRef.current.setRequestPending(false);
      }
    };

    connect(`/api/sessions/${sessionId}/events`, handler);

    return () => {
      disconnect();
    };
  }, [sessionId, connect, disconnect]);

  // Sync SSE status to store
  useEffect(() => {
    const unsub = onStatusChange((s) => {
      setSSEStatus(s);
    });
    return unsub;
  }, [onStatusChange, setSSEStatus]);

  // ---------------------------------------------------------------------------
  // Load session history when session changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!sessionId) return;
    if (!sessionLoading) return;
    if (skipNextHistoryLoad.current) {
      skipNextHistoryLoad.current = false;
      useAgentStore.setState({ sessionLoading: false });
      return;
    }

    fetch(`/api/sessions/${sessionId}/timeline`)
      .then((r) => (r.ok ? r.json() : null))
      .then((timeline) => {
        if (timeline) {
          loadTimeline(sessionId, timeline);
        }
      })
      .catch(() => {});
  }, [sessionId, sessionLoading, loadTimeline]);

  // ---------------------------------------------------------------------------
  // Auto-scroll
  // ---------------------------------------------------------------------------

  // biome-ignore lint/correctness/useExhaustiveDependencies: auto-scroll on timeline changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, toolCalls]);

  // ---------------------------------------------------------------------------
  // Polling fallback (aligned with TaskRunner timeout: 10 min)
  // ---------------------------------------------------------------------------

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!requestPending || !sessionId) return;

    const MAX_POLLS = 60;

    const timer = setTimeout(() => {
      let pollCount = 0;
      pollRef.current = setInterval(async () => {
        pollCount++;
        if (pollCount >= MAX_POLLS) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          storeFnsRef.current.setRequestPending(false);
          return;
        }
        try {
          const res = await fetch(`/api/sessions/${sessionId}/timeline`);
          if (!res.ok) return;
          const timeline = await res.json();
          // Check if any run is in terminal state
          const terminalRun = timeline.runs?.find(
            (r: { status: string }) =>
              r.status === "succeeded" || r.status === "failed" || r.status === "cancelled",
          );
          if (terminalRun) {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            storeFnsRef.current.syncFromServer(sessionId);
            storeFnsRef.current.setRequestPending(false);
            window.dispatchEvent(new Event("stock-skills:sessions-updated"));
          }
        } catch {
          /* retry */
        }
      }, 10_000);
    }, 10_000);

    return () => {
      clearTimeout(timer);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [requestPending, sessionId]);

  // ---------------------------------------------------------------------------
  // Send message via canonical API
  // ---------------------------------------------------------------------------

  const handleSend = useCallback(
    async (content: string, ctx?: ComposerContext) => {
      if (!sessionId) {
        // Create session + send message via commands API
        try {
          const res = await authFetch("/api/runtime/commands", {
            method: "POST",
            body: JSON.stringify({
              schemaVersion: "runtime-command.v1",
              type: "session.message.append_user",
              source: "research_desk",
              actor: "web_ui",
              content,
              context: buildMessageContext(content, ctx),
              startRun: true,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error ?? `HTTP ${res.status}`);
          }
          const data = await res.json();
          if (data.sessionId) {
            switchSession(data.sessionId);
            skipNextHistoryLoad.current = true;
            window.dispatchEvent(new Event("stock-skills:sessions-updated"));
            setRequestPending(true);
          }
        } catch (err) {
          useAgentStore.getState().addRuntimeEvent({
            id: `err_${Date.now()}`,
            schemaVersion: "runtime-event.v1",
            sessionSeq: 0,
            scope: "system",
            type: "error.created",
            category: "error",
            sessionId: sessionId ?? "",
            producer: "server",
            visibility: "ui",
            persist: 1,
            createdAt: new Date().toISOString(),
            payload: {
              code: "system.unexpected",
              message: `${labels.fallbackError}: ${err instanceof Error ? err.message : String(err)}`,
              retriable: false,
            },
          });
        }
      } else {
        sendMessage(sessionId, content, ctx);
      }
    },
    [sessionId, switchSession, labels.fallbackError],
  );

  function sendMessage(sid: string, content: string, ctx?: ComposerContext) {
    setRequestPending(true);

    authFetch("/api/runtime/commands", {
      method: "POST",
      body: JSON.stringify({
        schemaVersion: "runtime-command.v1",
        type: "session.message.append_user",
        source: "research_desk",
        actor: "web_ui",
        sessionId: sid,
        content,
        context: buildMessageContext(content, ctx),
        startRun: true,
      }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (data && !data.runId) {
          setRequestPending(false);
        }
      })
      .catch((err) => {
        useAgentStore.getState().addRuntimeEvent({
          id: `err_${Date.now()}`,
          schemaVersion: "runtime-event.v1",
          sessionSeq: 0,
          scope: "system",
          type: "error.created",
          category: "error",
          sessionId: sid,
          producer: "server",
          visibility: "ui",
          persist: 1,
          createdAt: new Date().toISOString(),
          payload: {
            code: "system.unexpected",
            message: `${labels.fallbackError}: ${err instanceof Error ? err.message : String(err)}`,
            retriable: false,
          },
        });
        setRequestPending(false);
      });
  }

  const handleStop = useCallback(() => {
    if (sessionId) {
      // Cancel via commands API
      const activeRunId = useAgentStore.getState().runtime.activeRunId;
      if (activeRunId) {
        authFetch("/api/runtime/commands", {
          method: "POST",
          body: JSON.stringify({
            schemaVersion: "runtime-command.v1",
            type: "run.cancel",
            source: "research_desk",
            actor: "web_ui",
            sessionId,
            runId: activeRunId,
          }),
        }).catch(() => {});
      }
    }
    setRequestPending(false);
  }, [sessionId]);

  const handlePromptClick = useCallback(
    (query: string) => {
      handleSend(query);
    },
    [handleSend],
  );

  const handleClearContext = useCallback((key: keyof ComposerContext) => {
    setComposerContext((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const hasMessages = messages.length > 0 || !!streamingText || toolCalls.length > 0;
  const isStreaming = status === "streaming";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border px-6 py-3 shrink-0">
        <FileText className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">{labels.title}</h1>
        {isStreaming && (
          <span className="flex items-center gap-1.5 text-xs text-primary ml-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            {labels.processing}
          </span>
        )}
        {sessionId && (
          <span className="text-xs text-muted-foreground font-mono ml-auto">{sessionId}</span>
        )}
      </header>

      {/* Context chips */}
      {Object.values(composerContext).some((v) => v) && (
        <div className="px-6 py-2 border-b border-border shrink-0">
          <ContextChips
            context={composerContext as ContextChipsData}
            onDismiss={(key) => handleClearContext(key as keyof ComposerContext)}
          />
        </div>
      )}

      {/* Content area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {sessionLoading ? (
          <div className="flex flex-1 items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : hasMessages ? (
          <div className="px-8 py-4 max-w-5xl mx-auto">
            <Timeline
              messages={messages}
              streamingText={streamingText}
              streamingThinking={streamingThinking}
              pendingToolCalls={toolCalls}
            />
          </div>
        ) : (
          <WelcomeScreen
            onPromptClick={handlePromptClick}
            onSend={handleSend}
            onStop={handleStop}
            streaming={isStreaming}
            disabled={requestPending && !isStreaming}
            context={composerContext}
            onClearContext={handleClearContext}
          />
        )}
      </div>

      {/* Composer */}
      {hasMessages && (
        <div className="border-t border-border px-8 py-3 shrink-0 max-w-5xl mx-auto w-full animate-composer-slide-up">
          <Composer
            onSend={handleSend}
            onStop={handleStop}
            streaming={isStreaming}
            disabled={requestPending && !isStreaming}
            context={composerContext}
            onClearContext={handleClearContext}
          />
        </div>
      )}
    </div>
  );
}
