"use client";

import { cn } from "@/lib/utils";
import { ExternalLink, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunCardData {
  run_id: string;
  status: string; // pending | running | success | failed | cancelled | queued
  skill_name: string;
  ticker?: string | null;
  created_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
}

interface RunCardProps {
  run: RunCardData;
  className?: string;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof Clock }
> = {
  queued: { label: "Queued", color: "bg-muted text-muted-foreground", icon: Clock },
  pending: { label: "Pending", color: "bg-muted text-muted-foreground", icon: Clock },
  running: {
    label: "Running",
    color: "bg-primary/15 text-primary",
    icon: Loader2,
  },
  success: {
    label: "Success",
    color: "bg-green-500/15 text-green-600 dark:text-green-400",
    icon: CheckCircle2,
  },
  completed: {
    label: "Completed",
    color: "bg-green-500/15 text-green-600 dark:text-green-400",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    color: "bg-destructive/15 text-destructive",
    icon: XCircle,
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-muted text-muted-foreground",
    icon: XCircle,
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RunCard({ run, className }: RunCardProps) {
  const config = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.pending;
  const Icon = config.icon;

  const durationStr = run.duration_ms
    ? `${(run.duration_ms / 1000).toFixed(1)}s`
    : null;

  return (
    <a
      href={`/runs/${run.run_id}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2",
        "hover:border-primary/50 hover:bg-primary/5 transition-colors",
        "group text-sm",
        className
      )}
    >
      {/* Status badge */}
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
          config.color
        )}
      >
        <Icon
          className={cn(
            "h-3 w-3",
            run.status === "running" && "animate-spin"
          )}
        />
        {config.label}
      </span>

      {/* Skill name */}
      <span className="font-medium text-foreground truncate">
        {run.skill_name}
      </span>

      {/* Ticker */}
      {run.ticker && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground font-mono">
          {run.ticker}
        </span>
      )}

      {/* Timing */}
      {durationStr && (
        <span className="text-xs text-muted-foreground ml-auto">
          {durationStr}
        </span>
      )}

      {/* Run ID (truncated) */}
      <span className="text-xs text-muted-foreground/50 font-mono">
        {run.run_id.slice(0, 8)}
      </span>

      {/* External link icon */}
      <ExternalLink className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary transition-colors" />
    </a>
  );
}
