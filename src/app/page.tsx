"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { useAgentStore } from "@/stores/agent";
import { useSSE } from "@/hooks/useSSE";
import { Timeline } from "@/components/research/Timeline";
import { Composer, type ComposerContext } from "@/components/research/Composer";
import { WelcomeScreen } from "@/components/research/WelcomeScreen";
import { ContextChips, type ContextChipsData } from "@/components/research/ContextChips";
import type { AgentMessage } from "@/stores/agent";
import { authFetch } from "@/lib/api/auth-fetch";
import { useLanguage } from "@/hooks/useLanguage";

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

function inferTicker(content: string): string | undefined {
  return content.match(/\b[A-Z]{1,6}\b/)?.[0];
}

function buildMessageContext(content: string, ctx?: ComposerContext) {
  const ticker = ctx?.ticker ?? inferTicker(content);
  const workflowType = ctx?.workflow;

  if (!ticker && !workflowType) return undefined;

  return {
    ticker,
    skill_name: ticker ? "stock-analyzer" : undefined,
    workflow_type: workflowType,
  };
}

export default function Home() {
  const {
    messages,
    sessionId,
    status,
    streamingText,
    sessionLoading,
    switchSession,
    loadHistory,
    addMessage,
    appendDelta,
    addToolCall,
    updateToolCall,
    clearStreaming,
    setSSEStatus,
    setSSERetryAttempt,
    setPendingRunId,
    fetchRunArtifacts,
  } = useAgentStore();

  const { connect, disconnect, onStatusChange } = useSSE();
  const { language } = useLanguage();
  const labels = LABELS[language];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [composerContext, setComposerContext] = useState<ComposerContext>({});
  const [requestPending, setRequestPending] = useState(false);

  // ---------------------------------------------------------------------------
  // SSE connection on session change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!sessionId) {
      disconnect();
      return;
    }

    const handlers = {
      "text_delta": (data: string) => {
        try {
          const parsed = JSON.parse(data);
          appendDelta(parsed.delta ?? parsed.text ?? data);
        } catch {
          appendDelta(data);
        }
      },
      "tool_call": (data: string) => {
        try {
          const parsed = JSON.parse(data);
          // Server sends: { runId, toolName, toolId, input }
          // Store expects: { id, name, status, args }
          addToolCall({
            id: parsed.toolId ?? parsed.id,
            name: parsed.toolName ?? parsed.name,
            args: typeof parsed.input === "string" ? parsed.input : JSON.stringify(parsed.input ?? {}),
            status: "running",
          });
        } catch {
          // ignore malformed events
        }
      },
      "tool_result": (data: string) => {
        try {
          const parsed = JSON.parse(data);
          const id = parsed.toolId ?? parsed.id;
          if (id) {
            updateToolCall(id, {
              status: parsed.error ? "error" : "completed",
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
            setPendingRunId(parsed.runId);
          }
        } catch {
          // ignore
        }
      },
      "run.updated": (data: string) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.status === "success" || parsed.status === "failed" || parsed.status === "cancelled") {
            // Fetch artifacts if run succeeded
            if (parsed.status === "success" && parsed.runId) {
              fetchRunArtifacts(parsed.runId);
            }
            // Move streamed text into messages and reset
            clearStreaming();
            setRequestPending(false);
            window.dispatchEvent(new Event("stock-skills:sessions-updated"));
          }
        } catch {
          clearStreaming();
          setRequestPending(false);
        }
      },
      "error": (data: string) => {
        try {
          const parsed = JSON.parse(data);
          addMessage({
            id: crypto.randomUUID(),
            role: "system",
            content: `${labels.errorPrefix}: ${parsed.message ?? parsed.error ?? data}`,
            timestamp: Date.now(),
          });
        } catch {
          addMessage({
            id: crypto.randomUUID(),
            role: "system",
            content: `${labels.errorPrefix}: ${data}`,
            timestamp: Date.now(),
          });
        }
        clearStreaming();
        setRequestPending(false);
      },
    };

    connect(`/api/sessions/${sessionId}/events`, handlers);

    return () => {
      disconnect();
    };
  }, [sessionId, connect, disconnect, appendDelta, addToolCall, updateToolCall, addMessage, clearStreaming, setPendingRunId, fetchRunArtifacts, labels.errorPrefix, setRequestPending]);

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

    fetch(`/api/sessions/${sessionId}/messages`)
      .then((r) => (r.ok ? r.json() : []))
      .then((msgs) => {
        const agentMessages: AgentMessage[] = msgs.map(
          (m: {
            message_id: string;
            role: string;
            content: string;
            created_at: string;
          }) => ({
            id: m.message_id,
            role: m.role as AgentMessage["role"],
            content: m.content,
            timestamp: new Date(m.created_at).getTime(),
          })
        );
        loadHistory(sessionId, agentMessages);
      })
      .catch(() => {});
  }, [sessionId, loadHistory]);

  // ---------------------------------------------------------------------------
  // Auto-scroll on new messages
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

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
          window.dispatchEvent(new Event("stock-skills:sessions-updated"));
          // Send message after session is created
          // Use a slight delay to allow SSE connection to establish
          setTimeout(() => {
            sendMessage(session_id, content, ctx);
          }, 300);
        } catch (err) {
          addMessage({
            id: crypto.randomUUID(),
            role: "system",
            content: `${labels.fallbackError}: ${
              err instanceof Error ? err.message : String(err)
            }`,
            timestamp: Date.now(),
          });
          return;
        }
      } else {
        sendMessage(sessionId, content, ctx);
      }
    },
    [sessionId, switchSession, addMessage, labels.fallbackError]
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
    clearStreaming();
    setRequestPending(true);

    // Send to API
    authFetch(`/api/sessions/${sid}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content,
        context: buildMessageContext(content, ctx),
      }),
    }).then((res) => {
      if (!res.ok) {
        addMessage({
          id: crypto.randomUUID(),
          role: "system",
          content: `${labels.fallbackError}: ${res.status}`,
          timestamp: Date.now(),
        });
      }
    }).catch((err) => {
      addMessage({
        id: crypto.randomUUID(),
        role: "system",
        content: `${labels.fallbackError}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        timestamp: Date.now(),
      });
    });
  }

  const handleStop = useCallback(() => {
    if (sessionId) {
      authFetch(`/api/sessions/${sessionId}/cancel`, {
        method: "POST",
      }).catch(() => {});
    }
    clearStreaming();
  }, [clearStreaming, sessionId]);

  const handlePromptClick = useCallback(
    (query: string) => {
      handleSend(query);
    },
    [handleSend]
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

  const hasMessages = messages.length > 0 || !!streamingText;
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
          <span className="text-xs text-muted-foreground font-mono ml-auto">
            {sessionId}
          </span>
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
          <div className="px-6 py-4 max-w-3xl mx-auto">
            <Timeline messages={messages} streamingText={streamingText} />
          </div>
        ) : (
          <WelcomeScreen onPromptClick={handlePromptClick} />
        )}
      </div>

      {/* Composer - always visible */}
      <div className="border-t border-border px-6 py-3 shrink-0 max-w-3xl mx-auto w-full">
        <Composer
          onSend={handleSend}
          onStop={handleStop}
          streaming={isStreaming}
          disabled={requestPending && !isStreaming}
          context={composerContext}
          onClearContext={handleClearContext}
        />
      </div>
    </div>
  );
}
