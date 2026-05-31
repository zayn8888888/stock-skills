"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import type { ToolCallEntry } from "@/stores/agent";
import { Check, ChevronDown, ChevronRight, Loader2, Wrench, X } from "lucide-react";
import { useState } from "react";

const LABELS = {
  en: {
    toolCalls: "Tool calls",
    running: "Running",
    completed: "Done",
    failed: "Failed",
    input: "Input",
    result: "Result",
  },
  zh: {
    toolCalls: "工具调用",
    running: "执行中",
    completed: "完成",
    failed: "失败",
    input: "参数",
    result: "结果",
  },
} as const;

interface ThinkingTimelineProps {
  toolCalls: ToolCallEntry[];
  className?: string;
}

function StatusIcon({ status }: { status: ToolCallEntry["status"] }) {
  switch (status) {
    case "pending":
      return <span className="inline-block h-3 w-3 rounded-full bg-muted-foreground/30" />;
    case "running":
      return <Loader2 className="h-3 w-3 animate-spin text-primary" />;
    case "completed":
      return (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-gain/15">
          <Check className="h-2.5 w-2.5 text-gain" />
        </span>
      );
    case "error":
      return (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-loss/15">
          <X className="h-2.5 w-2.5 text-loss" />
        </span>
      );
  }
}

function formatToolName(name: string): string {
  // Convert fixture_quote_snapshot → Quote Snapshot
  return name
    .replace(/^(fixture|futu|yfinance|tavily)_/, "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatJson(str: string | undefined): string {
  if (!str) return "";
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

// ── Single tool call detail (expandable) ───────────────────────────

interface ToolCallDetailProps {
  tc: ToolCallEntry;
  labels: (typeof LABELS)["en"] | (typeof LABELS)["zh"];
}

function ToolCallDetail({ tc, labels }: ToolCallDetailProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      {/* Tool header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2.5 w-full px-2.5 py-1.5 text-xs hover:bg-muted/30 transition-colors",
          tc.status === "running" && "bg-primary/5",
        )}
      >
        <StatusIcon status={tc.status} />
        <span className="font-mono text-foreground/70 text-[11px]">{formatToolName(tc.name)}</span>
        {tc.args && (
          <span className="truncate text-muted-foreground/40 text-[10px] font-mono ml-auto max-w-[200px]">
            {tc.args.length > 60 ? `${tc.args.slice(0, 60)}…` : tc.args}
          </span>
        )}
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Expanded: input + result */}
      {open && (
        <div className="border-t border-border/40 px-2.5 py-2 space-y-2 text-[11px]">
          {/* Input */}
          {tc.args && (
            <div>
              <p className="text-muted-foreground/60 font-medium mb-0.5">{labels.input}</p>
              <pre className="bg-muted/50 rounded-md p-2 overflow-x-auto font-mono text-foreground/70 whitespace-pre-wrap break-all">
                {formatJson(tc.args)}
              </pre>
            </div>
          )}
          {/* Result */}
          {tc.result && (
            <div>
              <p className="text-muted-foreground/60 font-medium mb-0.5">{labels.result}</p>
              <pre className="bg-muted/50 rounded-md p-2 overflow-x-auto font-mono text-foreground/70 whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto">
                {formatJson(tc.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ThinkingTimeline({ toolCalls, className }: ThinkingTimelineProps) {
  const [expanded, setExpanded] = useState(false);
  const { language } = useLanguage();
  const labels = LABELS[language];

  if (toolCalls.length === 0) return null;

  const runningCount = toolCalls.filter((tc) => tc.status === "running").length;
  const completedCount = toolCalls.filter((tc) => tc.status === "completed").length;
  const summary =
    toolCalls.length === 1
      ? formatToolName(toolCalls[0].name)
      : `${formatToolName(toolCalls[0].name)} +${toolCalls.length - 1}`;

  return (
    <div className={cn("flex gap-2 items-start", className)}>
      {/* Agent avatar spacer (aligns with MessageBubble) */}
      <div className="flex-shrink-0 w-7" />

      <div className="flex-1 rounded-xl border border-border/50 bg-card/50 overflow-hidden">
        {/* Header */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-xs hover:bg-muted/30 transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          )}
          <Wrench className="h-3 w-3 text-primary" />
          <span className="font-medium text-foreground/80">{labels.toolCalls}</span>
          <span className="text-muted-foreground/60 truncate">{summary}</span>
          <span className="ml-auto flex items-center gap-1.5">
            {runningCount > 0 && (
              <span className="flex items-center gap-1 text-primary">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                {runningCount}
              </span>
            )}
            {completedCount > 0 && (
              <span className="flex items-center gap-1 text-gain">
                <Check className="h-2.5 w-2.5" />
                {completedCount}
              </span>
            )}
          </span>
        </button>

        {/* Expanded details */}
        {expanded && (
          <div className="border-t border-border/50 px-3 py-2 space-y-2">
            {toolCalls.map((tc) => (
              <ToolCallDetail key={tc.id} tc={tc} labels={labels} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
