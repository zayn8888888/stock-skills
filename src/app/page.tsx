"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { useAgentStore } from "@/stores/agent";
import { useSSE } from "@/hooks/useSSE";
import { Timeline } from "@/components/research/Timeline";
import { Composer, type ComposerContext } from "@/components/research/Composer";
import { WelcomeScreen } from "@/components/research/WelcomeScreen";
import { ContextChips, type ContextChipsData } from "@/components/research/ContextChips";
import type { AgentMessage, ToolCallEntry } from "@/stores/agent";

// ---------------------------------------------------------------------------
// Session list types (matches Sidebar)
// ---------------------------------------------------------------------------

interface SessionEntry {
  id: string;
  title: string;
  status: "running" | "completed" | "failed" | "due_review";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Home() {
  const {
    messages,
    sessionId,
    status,
    streamingText,
    toolCalls,
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
  } = useAgentStore();

  const { connect, disconnect, onStatusChange } = useSSE();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [composerContext, setComposerContext] = useState<ComposerContext>({});

  // ---------------------------------------------------------------------------
  // Session list
  // ---------------------------------------------------------------------------

  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setSessions(data))
      .catch(() => {});
  }, []);

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
          const parsed = JSON.parse(data) as ToolCallEntry;
          addToolCall(parsed);
        } catch {
          // ignore malformed events
        }
      },
      "tool_result": (data: string) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.id) {
            updateToolCall(parsed.id, {
              status: parsed.error ? "error" : "completed",
              result: parsed.result ?? parsed.error,
            });
          }
        } catch {
          // ignore
        }
      },
      "run.created": (data: string) => {
        // Could display a RunCard inline; for now the event is logged
      },
      "run.updated": (data: string) => {
        // Could update an inline RunCard
      },
      "error": (data: string) => {
        // Display error as a system message
        try {
          const parsed = JSON.parse(data);
          addMessage({
            id: crypto.randomUUID(),
            role: "system",
            content: `Error: ${parsed.message ?? parsed.error ?? data}`,
            timestamp: Date.now(),
          });
        } catch {
          addMessage({
            id: crypto.randomUUID(),
            role: "system",
            content: `Error: ${data}`,
            timestamp: Date.now(),
          });
        }
      },
    };

    connect(`/api/sessions/${sessionId}/events`, handlers);

    return () => {
      disconnect();
    };
  }, [sessionId, connect, disconnect, appendDelta, addToolCall, updateToolCall, addMessage]);

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
          const res = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: content.slice(0, 60),
            }),
          });
          if (!res.ok) return;
          const { session_id } = await res.json();
          switchSession(session_id);
          // Refresh sessions list
          fetch("/api/sessions")
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => setSessions(data))
            .catch(() => {});
          // Send message after session is created
          // Use a slight delay to allow SSE connection to establish
          setTimeout(() => {
            sendMessage(session_id, content, ctx);
          }, 300);
        } catch {
          return;
        }
      } else {
        sendMessage(sessionId, content, ctx);
      }
    },
    [sessionId, switchSession]
  );

  function sendMessage(sid: string, content: string, ctx?: ComposerContext) {
    // Add user message to local store immediately
    addMessage({
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: Date.now(),
    });

    // Clear any previous streaming state
    clearStreaming();

    // Send to API
    fetch(`/api/sessions/${sid}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        context: ctx?.ticker || ctx?.workflow
          ? {
              ticker: ctx.ticker,
              workflow_type: ctx.workflow,
            }
          : undefined,
      }),
    }).catch(() => {});
  }

  const handleStop = useCallback(() => {
    clearStreaming();
  }, [clearStreaming]);

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
        <h1 className="text-lg font-semibold">Research Desk</h1>
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
          context={composerContext}
          onClearContext={handleClearContext}
        />
      </div>
    </div>
  );
}
