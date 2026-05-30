"use client";

import {
  TrendingUp,
  Target,
  Paperclip,
  Workflow,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextChipsData {
  ticker?: string;
  goal?: string;
  attachment?: string;
  workflow?: string;
  owner?: string;
}

interface ContextChipsProps {
  context: ContextChipsData;
  onDismiss?: (key: keyof ContextChipsData) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Chip config
// ---------------------------------------------------------------------------

const CHIP_ICONS: Record<string, typeof TrendingUp> = {
  ticker: TrendingUp,
  goal: Target,
  attachment: Paperclip,
  workflow: Workflow,
  owner: User,
};

const CHIP_LABELS: Record<string, string> = {
  ticker: "Ticker",
  goal: "Goal",
  attachment: "Attachment",
  workflow: "Workflow",
  owner: "Owner",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ContextChips({ context, onDismiss, className }: ContextChipsProps) {
  const entries = Object.entries(context).filter(
    ([, v]) => v !== undefined && v !== ""
  ) as [keyof ContextChipsData, string][];

  if (entries.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {entries.map(([key, value]) => {
        const Icon = CHIP_ICONS[key] ?? Target;
        const label = CHIP_LABELS[key] ?? key;

        return (
          <span
            key={key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs",
              "text-muted-foreground"
            )}
          >
            <Icon className="h-3 w-3" />
            <span className="font-medium">{label}:</span>
            <span className="text-foreground">{value}</span>
            {onDismiss && (
              <button
                onClick={() => onDismiss(key)}
                className="ml-0.5 text-muted-foreground/60 hover:text-destructive transition-colors"
                aria-label={`Remove ${label}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
