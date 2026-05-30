"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCallEntry } from "@/stores/agent";

interface ThinkingTimelineProps {
  toolCalls: ToolCallEntry[];
  className?: string;
}

function statusIcon(status: ToolCallEntry["status"]) {
  switch (status) {
    case "pending":
      return <span className="inline-block h-3 w-3 rounded-full bg-muted-foreground/30" />;
    case "running":
      return <Loader2 className="h-3 w-3 animate-spin text-primary" />;
    case "completed":
      return <Check className="h-3 w-3 text-green-500" />;
    case "error":
      return <X className="h-3 w-3 text-destructive" />;
  }
}

function elapsedLabel(toolCall: ToolCallEntry): string | null {
  // If we have args parsed as JSON with timing info, extract it;
  // otherwise return null since the store doesn't track timing directly.
  if (toolCall.status === "running") return "...";
  return null;
}

export function ThinkingTimeline({ toolCalls, className }: ThinkingTimelineProps) {
  const [expanded, setExpanded] = useState(false);

  if (toolCalls.length === 0) return null;

  const summary =
    toolCalls.length === 1
      ? toolCalls[0].name
      : `${toolCalls[0].name} +${toolCalls.length - 1} more`;

  return (
    <div className={cn("rounded-md border border-border bg-muted/30", className)}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span className="font-medium">Tool calls</span>
        <span className="text-muted-foreground/70">{summary}</span>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-1.5">
          {toolCalls.map((tc) => (
            <div
              key={tc.id}
              className="flex items-center gap-2 text-xs"
            >
              {statusIcon(tc.status)}
              <span className="font-mono text-foreground/80">{tc.name}</span>
              {tc.args && (
                <span className="truncate text-muted-foreground/60 max-w-[200px]">
                  {tc.args}
                </span>
              )}
              <span className="ml-auto text-muted-foreground/50">
                {elapsedLabel(tc)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
