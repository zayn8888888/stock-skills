"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { ChevronDown, ChevronRight, Bot, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { MessageBubble } from "./MessageBubble";
import { ThinkingTimeline } from "./ThinkingTimeline";
import type { AgentMessage } from "@/stores/agent";

const LABELS = {
  en: { turn: "Turn", runs: "run", runsPlural: "runs", thinking: "Thinking..." },
  zh: { turn: "回合", runs: "次运行", runsPlural: "次运行", thinking: "思考中..." },
} as const;

// ---------------------------------------------------------------------------
// Turn grouping
// ---------------------------------------------------------------------------

interface Turn {
  userMessage: AgentMessage;
  subsequent: AgentMessage[];
  toolCalls: AgentMessage["toolCalls"];
}

function groupIntoTurns(messages: AgentMessage[]): Turn[] {
  const turns: Turn[] = [];
  let currentTurn: Turn | null = null;

  for (const msg of messages) {
    if (msg.role === "user") {
      if (currentTurn) turns.push(currentTurn);
      currentTurn = {
        userMessage: msg,
        subsequent: [],
        toolCalls: [],
      };
    } else if (currentTurn) {
      currentTurn.subsequent.push(msg);
      if (msg.toolCalls?.length) {
        currentTurn.toolCalls = [
          ...(currentTurn.toolCalls ?? []),
          ...msg.toolCalls,
        ];
      }
    } else {
      currentTurn = {
        userMessage: msg,
        subsequent: [],
        toolCalls: msg.toolCalls,
      };
    }
  }
  if (currentTurn) turns.push(currentTurn);

  return turns;
}

// ---------------------------------------------------------------------------
// Single Turn
// ---------------------------------------------------------------------------

interface TurnViewProps {
  turn: Turn;
  index: number;
  defaultExpanded: boolean;
}

function TurnView({ turn, index, defaultExpanded }: TurnViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { language } = useLanguage();
  const labels = LABELS[language];

  const summary = turn.userMessage.content.slice(0, 50);
  const runCount = turn.subsequent.length;

  return (
    <div className="space-y-3">
      {/* Turn header - collapsible for older turns */}
      {!defaultExpanded && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full group"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <span className="text-muted-foreground/60">
            {labels.turn} {index + 1}
          </span>
          <span className="text-muted-foreground/40 truncate">
            {summary}{summary.length >= 50 ? "..." : ""}
          </span>
        </button>
      )}

      {(expanded || defaultExpanded) && (
        <div className="space-y-4">
          <MessageBubble message={turn.userMessage} />

          {turn.toolCalls && turn.toolCalls.length > 0 && (
            <ThinkingTimeline toolCalls={turn.toolCalls} />
          )}

          {turn.subsequent.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Streaming indicator (agent avatar + status)
// ---------------------------------------------------------------------------

function StreamingIndicator({ text }: { text?: string }) {
  const { language } = useLanguage();
  const labels = LABELS[language];

  return (
    <div className="flex gap-2 items-start">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center mt-0.5">
        <Bot className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">{labels.thinking}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Streaming markdown content
// ---------------------------------------------------------------------------

function StreamingContent({ text }: { text: string }) {
  return (
    <div className="flex gap-2 items-start">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center mt-0.5">
        <Bot className="h-3.5 w-3.5 text-primary" />
      </div>
      <div
        className={cn(
          "rounded-2xl rounded-tl-md px-4 py-3 flex-1 min-w-0",
          "bg-card border border-border/50 shadow-sm",
          "prose prose-sm max-w-none",
          "prose-pre:p-0 prose-pre:border-0 prose-pre:bg-transparent"
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
        >
          {text}
        </ReactMarkdown>
        <span className="inline-block w-1.5 h-4 bg-primary animate-stream-cursor ml-0.5 align-text-bottom rounded-sm" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

interface TimelineProps {
  messages: AgentMessage[];
  streamingText?: string;
  pendingToolCalls?: AgentMessage["toolCalls"];
  className?: string;
}

export function Timeline({ messages, streamingText, pendingToolCalls, className }: TimelineProps) {
  const turns = useMemo(() => groupIntoTurns(messages), [messages]);
  const isExpandedDefault = (index: number) => index >= turns.length - 2;
  const hasPendingActivity = (pendingToolCalls && pendingToolCalls.length > 0) || !!streamingText;

  return (
    <div className={cn("space-y-6", className)}>
      {turns.map((turn, i) => (
        <TurnView
          key={turn.userMessage.id}
          turn={turn}
          index={i}
          defaultExpanded={isExpandedDefault(i)}
        />
      ))}

      {/* In-progress activity */}
      {pendingToolCalls && pendingToolCalls.length > 0 && (
        <ThinkingTimeline toolCalls={pendingToolCalls} />
      )}

      {/* Streaming text with markdown rendering */}
      {streamingText ? (
        <StreamingContent text={streamingText} />
      ) : hasPendingActivity ? (
        <StreamingIndicator />
      ) : null}
    </div>
  );
}
