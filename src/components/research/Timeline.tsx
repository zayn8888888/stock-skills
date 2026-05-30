"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { MessageBubble } from "./MessageBubble";
import { ThinkingTimeline } from "./ThinkingTimeline";
import type { AgentMessage } from "@/stores/agent";

const LABELS = {
  en: { turn: "Turn", runs: "run", runsPlural: "runs" },
  zh: { turn: "回合", runs: "次运行", runsPlural: "次运行" },
} as const;

// ---------------------------------------------------------------------------
// Turn grouping
// ---------------------------------------------------------------------------

interface Turn {
  /** The user message that starts this turn. */
  userMessage: AgentMessage;
  /** Subsequent non-user messages (assistant, system, tool, event) before the next user message. */
  subsequent: AgentMessage[];
  /** Accumulated tool calls from all messages in this turn. */
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
      // Message before any user message (e.g., system greeting) - wrap as its own turn
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
      {/* Turn header - collapsible for non-expand turns */}
      {!defaultExpanded && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <span>
            {labels.turn} {index + 1}: {summary}
            {summary.length >= 50 ? "..." : ""}{" "}
            <span className="text-muted-foreground/60">
              ({runCount} {runCount !== 1 ? labels.runsPlural : labels.runs})
            </span>
          </span>
        </button>
      )}

      {(expanded || defaultExpanded) && (
        <div className="space-y-4">
          {/* User message */}
          <MessageBubble message={turn.userMessage} />

          {/* Tool calls timeline */}
          {turn.toolCalls && turn.toolCalls.length > 0 && (
            <ThinkingTimeline toolCalls={turn.toolCalls} />
          )}

          {/* Subsequent messages (system, assistant, tool, event) */}
          {turn.subsequent.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

interface TimelineProps {
  messages: AgentMessage[];
  streamingText?: string;
  className?: string;
}

export function Timeline({ messages, streamingText, className }: TimelineProps) {
  const turns = useMemo(() => groupIntoTurns(messages), [messages]);

  // Default: expand the latest 2 turns, collapse older
  const isExpandedDefault = (index: number) => index >= turns.length - 2;

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

      {/* Streaming assistant response */}
      {streamingText && (
        <div className="flex justify-start">
          <div
            className={cn(
              "max-w-[85%] rounded-lg bg-card px-4 py-3 text-card-foreground",
              "prose prose-sm dark:prose-invert max-w-none",
              "prose-pre:bg-muted prose-pre:text-sm",
              "prose-code:before:hidden prose-code:after:hidden"
            )}
          >
            <p className="whitespace-pre-wrap text-sm">{streamingText}</p>
            <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
          </div>
        </div>
      )}
    </div>
  );
}
