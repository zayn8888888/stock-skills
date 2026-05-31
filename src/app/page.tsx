"use client";

import { Composer, type ComposerContext } from "@/components/research/Composer";
import { ContextChips, type ContextChipsData } from "@/components/research/ContextChips";
import { Timeline } from "@/components/research/Timeline";
import { WelcomeScreen } from "@/components/research/WelcomeScreen";
import { useLanguage } from "@/hooks/useLanguage";
import { useSSE } from "@/hooks/useSSE";
import { authFetch } from "@/lib/api/auth-fetch";
import { buildMessageContext } from "@/lib/research/message-context";
import { useAgentStore } from "@/stores/agent";
import type { AgentMessage } from "@/stores/agent";
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
    messages,
    sessionId,
    status,
    streamingText,
    streamingThinking,
    toolCalls,
    sessionLoading,
    switchSession,
    loadHistory,
    addMessage,
    appendDelta,
    appendThinkingDelta,
    addToolCall,
    updateToolCall,
    clearStreaming,
    setSSEStatus,
    setPendingRunId,
    fetchRunArtifacts,
    syncFromServer,
  } = useAgentStore();

  const { connect, disconnect, onStatusChange } = useSSE();
  const { language } = useLanguage();
  const labels = LABELS[language];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [composerContext, setComposerContext] = useState<ComposerContext>({});
  const [requestPending, setRequestPending] = useState(false);
  const skipNextHistoryLoad = useRef(false);
  // Ref to hold latest store functions — prevents SSE effect from re-running
  // on every store state change (Zustand selector returns new function refs).
  const storeFnsRef = useRef({
    appendDelta,
    appendThinkingDelta,
    addToolCall,
    updateToolCall,
    addMessage,
    clearStreaming,
    setPendingRunId,
    fetchRunArtifacts,
    syncFromServer,
    setRequestPending,
  });
  storeFnsRef.current = {
    appendDelta,
    appendThinkingDelta,
    addToolCall,
    updateToolCall,
    addMessage,
    clearStreaming,
    setPendingRunId,
    fetchRunArtifacts,
    syncFromServer,
    setRequestPending,
  };

  // ---------------------------------------------------------------------------
  // SSE connection on session change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!sessionId) {
      disconnect();
      return;
    }

    const handlers = {
      text_delta: (data: string) => {
        try {
          const parsed = JSON.parse(data);
          storeFnsRef.current.appendDelta(parsed.delta ?? parsed.text ?? data);
        } catch {
          storeFnsRef.current.appendDelta(data);
        }
      },
      thinking_delta: (data: string) => {
        try {
          const parsed = JSON.parse(data);
          storeFnsRef.current.appendThinkingDelta(parsed.text ?? parsed.delta ?? data);
        } catch {
          storeFnsRef.current.appendThinkingDelta(data);
        }
      },
      tool_call: (data: string) => {
        try {
          const parsed = JSON.parse(data);
          storeFnsRef.current.addToolCall({
            id: parsed.toolId ?? parsed.id,
            name: parsed.toolName ?? parsed.name,
            args:
              typeof parsed.input === "string" ? parsed.input : JSON.stringify(parsed.input ?? {}),
            status: "running",
          });
        } catch {
          // ignore malformed events
        }
      },
      tool_result: (data: string) => {
        try {
          const parsed = JSON.parse(data);
          const id = parsed.toolId ?? parsed.id;
          if (id) {
            storeFnsRef.current.updateToolCall(id, {
              status: parsed.status ?? (parsed.error ? "error" : "completed"),
              result: parsed.result ?? parsed.error,
            });
          }
        } catch {
          // ignore
        }
      },
      "run.created": (data: string) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.runId) {
            storeFnsRef.current.setPendingRunId(parsed.runId);
            storeFnsRef.current.setRequestPending(true);
          }
        } catch {
          // ignore
        }
      },
      "run.updated": (data: string) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.runId && (parsed.status === "pending" || parsed.status === "running")) {
            storeFnsRef.current.setPendingRunId(parsed.runId);
            storeFnsRef.current.setRequestPending(true);
            return;
          }
          if (
            parsed.status === "success" ||
            parsed.status === "failed" ||
            parsed.status === "cancelled"
          ) {
            if (parsed.status === "success" && parsed.runId) {
              storeFnsRef.current.fetchRunArtifacts(parsed.runId);
            }
            storeFnsRef.current.clearStreaming();
            storeFnsRef.current.setRequestPending(false);
            window.dispatchEvent(new Event("stock-skills:sessions-updated"));
            const currentSessionId = sessionId;
            if (currentSessionId) {
              setTimeout(() => {
                storeFnsRef.current.syncFromServer(currentSessionId);
              }, 500);
            }
          }
        } catch {
          storeFnsRef.current.clearStreaming();
          storeFnsRef.current.setRequestPending(false);
        }
      },
      error: (data: string) => {
        try {
          const parsed = JSON.parse(data);
          storeFnsRef.current.addMessage({
            id: crypto.randomUUID(),
            role: "system",
            content: `${labels.errorPrefix}: ${parsed.message ?? parsed.error ?? data}`,
            timestamp: Date.now(),
          });
        } catch {
          storeFnsRef.current.addMessage({
            id: crypto.randomUUID(),
            role: "system",
            content: `${labels.errorPrefix}: ${data}`,
            timestamp: Date.now(),
          });
        }
        storeFnsRef.current.clearStreaming();
        storeFnsRef.current.setRequestPending(false);
      },
    };

    connect(`/api/sessions/${sessionId}/events`, handlers);

    return () => {
      disconnect();
    };
  }, [sessionId, connect, disconnect, labels.errorPrefix]);

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
    // Skip fetch if messages were already loaded from cache
    if (!sessionLoading) return;
    // Skip if we just created this session (user message already in store)
    if (skipNextHistoryLoad.current) {
      skipNextHistoryLoad.current = false;
      useAgentStore.setState({ sessionLoading: false });
      return;
    }

    Promise.all([
      fetch(`/api/sessions/${sessionId}/messages`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/sessions/${sessionId}/tool-events`).then((r) => (r.ok ? r.json() : {})),
    ])
      .then(([msgs, toolCallsByRun]) => {
        const agentMessages: AgentMessage[] = msgs.map(
          (m: {
            message_id: string;
            role: string;
            content: string;
            created_at: string;
            metadata?: { runId?: string } | null;
          }) => ({
            id: m.message_id,
            role: m.role as AgentMessage["role"],
            content: m.content,
            timestamp: new Date(m.created_at).getTime(),
            runId: m.metadata?.runId,
          }),
        );
        loadHistory(sessionId, agentMessages, toolCallsByRun);
      })
      .catch(() => {});
  }, [sessionId, sessionLoading, loadHistory]);

  // ---------------------------------------------------------------------------
  // Auto-scroll on new messages
  // ---------------------------------------------------------------------------

  // biome-ignore lint/correctness/useExhaustiveDependencies: auto-scroll intentionally reruns when timeline content changes.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, toolCalls]);

  // ---------------------------------------------------------------------------
  // Polling fallback — if SSE events never arrive, poll for final result
  // Only fires when SSE is broken; timeout aligned with TaskRunner (10 min).
  // ---------------------------------------------------------------------------

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!requestPending || !sessionId) return;

    const MAX_POLLS = 60; // 60 * 10s = 10 min (aligned with TaskRunner timeout)

    // Wait 10s for SSE events; if no assistant message appears, start polling
    const timer = setTimeout(() => {
      let pollCount = 0;
      pollRef.current = setInterval(async () => {
        pollCount++;
        if (pollCount >= MAX_POLLS) {
          // Timeout: clear pending state
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          storeFnsRef.current.addMessage({
            id: crypto.randomUUID(),
            role: "system",
            content:
              language === "zh" ? "请求超时，请重试。" : "Request timed out. Please try again.",
            timestamp: Date.now(),
          });
          storeFnsRef.current.clearStreaming();
          storeFnsRef.current.setRequestPending(false);
          return;
        }
        try {
          const res = await fetch(`/api/sessions/${sessionId}/messages`);
          if (!res.ok) return;
          const msgs: Array<{
            message_id: string;
            role: string;
            content: string;
            created_at: string;
            metadata?: { runId?: string } | null;
          }> = await res.json();
          const assistantMsg = msgs.find((m) => m.role === "assistant");
          if (assistantMsg) {
            // Agent finished — sync from server
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            storeFnsRef.current.syncFromServer(sessionId);
            storeFnsRef.current.clearStreaming();
            storeFnsRef.current.setRequestPending(false);
            window.dispatchEvent(new Event("stock-skills:sessions-updated"));
          }
        } catch {
          /* retry on next interval */
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
  }, [requestPending, sessionId, language]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Send message
  // ---------------------------------------------------------------------------

  const handleSend = useCallback(
    async (content: string, ctx?: ComposerContext) => {
      if (!sessionId) {
        // Create a new session first
        try {
          const res = await authFetch("/api/sessions", {
            method: "POST",
            body: JSON.stringify({
              title: content.slice(0, 60),
            }),
          });
          if (!res.ok) {
            addMessage({
              id: crypto.randomUUID(),
              role: "system",
              content: `${labels.fallbackError}: ${res.status}`,
              timestamp: Date.now(),
            });
            return;
          }
          const { session_id } = await res.json();
          switchSession(session_id);
          skipNextHistoryLoad.current = true;
          window.dispatchEvent(new Event("stock-skills:sessions-updated"));
          // Send message after a slight delay to allow SSE connection to establish
          setTimeout(() => {
            sendMessage(session_id, content, ctx);
          }, 300);
        } catch (err) {
          addMessage({
            id: crypto.randomUUID(),
            role: "system",
            content: `${labels.fallbackError}: ${err instanceof Error ? err.message : String(err)}`,
            timestamp: Date.now(),
          });
          return;
        }
      } else {
        sendMessage(sessionId, content, ctx);
      }
    },
    [sessionId, switchSession, addMessage, labels.fallbackError],
  );

  function sendMessage(sid: string, content: string, ctx?: ComposerContext) {
    // Add user message to local store immediately
    addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: Date.now(),
    });

    // Clear any previous streaming state and mark as pending
    clearStreaming(true);
    setRequestPending(true);

    // Send to API
    authFetch(`/api/sessions/${sid}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content,
        context: buildMessageContext(content, ctx),
      }),
    })
      .then((res) => {
        if (!res.ok) {
          addMessage({
            id: crypto.randomUUID(),
            role: "system",
            content: `${labels.fallbackError}: ${res.status}`,
            timestamp: Date.now(),
          });
          setRequestPending(false);
          return undefined;
        }
        return res.json();
      })
      .then((data) => {
        // If no run was created, clear pending immediately
        if (data && !data.linked_run_id) {
          setRequestPending(false);
        }
      })
      .catch((err) => {
        addMessage({
          id: crypto.randomUUID(),
          role: "system",
          content: `${labels.fallbackError}: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        });
        setRequestPending(false);
      });
  }

  const handleStop = useCallback(() => {
    if (sessionId) {
      authFetch(`/api/sessions/${sessionId}/cancel`, {
        method: "POST",
      }).catch(() => {});
    }
    clearStreaming(true); // force-clear, don't create partial message
    setRequestPending(false);
  }, [clearStreaming, sessionId]);

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

      {/* Composer — only visible once conversation has started */}
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
