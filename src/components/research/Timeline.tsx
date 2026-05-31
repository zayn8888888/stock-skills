"use client";

import { MarkdownContent } from "@/components/common/MarkdownContent";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import type { AgentMessage } from "@/stores/agent";
import { Bot, ChevronDown, ChevronRight, Brain, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { MessageBubble } from "./MessageBubble";
import { ThinkingTimeline } from "./ThinkingTimeline";

const LABELS = {
  en: { turn: "Turn", runs: "run", runsPlural: "runs", thinking: "Thinking...", reasoning: "Reasoning" },
  zh: { turn: "回合", runs: "次运行", runsPlural: "次运行", thinking: "思考中...", reasoning: "推理过程" },
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
        currentTurn.toolCalls = [...(currentTurn.toolCalls ?? []), ...msg.toolCalls];
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

  return (
    <div className="space-y-3">
      {/* Turn header - collapsible for older turns */}
      {!defaultExpanded && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full group"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="text-muted-foreground/60">
            {labels.turn} {index + 1}
          </span>
          <span className="text-muted-foreground/40 truncate">
            {summary}
            {summary.length >= 50 ? "..." : ""}
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
// Thinking / reasoning block (collapsible)
// ---------------------------------------------------------------------------

function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const { language } = useLanguage();
  const labels = LABELS[language];

  return (
    <div className="flex gap-2 items-start">
      <div className="flex-shrink-0 w-7" />
      <div className="flex-1 rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted/30 transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
          <Brain className="h-3 w-3 text-violet-500" />
          <span className="font-medium text-foreground/80">{labels.reasoning}</span>
          <span className="text-muted-foreground/50 text-[10px] truncate ml-1">
            {text.length > 100 ? `${text.slice(0, 100)}…` : text}
          </span>
          <Loader2 className="h-2.5 w-2.5 animate-spin text-violet-500 ml-auto" />
        </button>
        {expanded && (
          <div className="border-t border-border/50 px-3 py-2">
            <pre className="text-[11px] text-foreground/60 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-[400px] overflow-y-auto">
              {text}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Streaming indicator (agent avatar + status)
// ---------------------------------------------------------------------------

function StreamingIndicator({ text }: { text?: string }) {
  const { language } = useLanguage();
  const labels = LABELS[language];
  const indicatorText = text ?? labels.thinking;

  return (
    <div className="flex gap-2 items-start">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center mt-0.5">
        <Bot className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">{indicatorText}</span>
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
      <MarkdownContent content={text} streaming className="flex-1 min-w-0" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

interface TimelineProps {
  messages: AgentMessage[];
  streamingText?: string;
  streamingThinking?: string;
  pendingToolCalls?: AgentMessage["toolCalls"];
  className?: string;
}

export function Timeline({
  messages,
  streamingText,
  streamingThinking,
  pendingToolCalls,
  className,
}: TimelineProps) {
  const turns = useMemo(() => groupIntoTurns(messages), [messages]);
  const isExpandedDefault = (index: number) => index >= turns.length - 2;
  const hasPendingActivity =
    (pendingToolCalls && pendingToolCalls.length > 0) || !!streamingText || !!streamingThinking;

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

      {/* Thinking / reasoning block — shown before tool calls and text */}
      {streamingThinking && <ThinkingBlock text={streamingThinking} />}

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
