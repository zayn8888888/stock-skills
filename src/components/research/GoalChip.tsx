"use client";

import { useState } from "react";
import { Target, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoalData {
  id: string;
  goal: string;
  status: string; // active | achieved | abandoned | superseded
  criteria?: {
    id: string;
    criterion: string;
    status: string; // pending | met | unmet | na
  }[];
}

interface GoalChipProps {
  goal: GoalData;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoalChip({ goal, className }: GoalChipProps) {
  const [expanded, setExpanded] = useState(false);

  const criteria = goal.criteria ?? [];
  const metCount = criteria.filter(
    (c) => c.status === "met"
  ).length;

  const statusColor: Record<string, string> = {
    active: "text-primary",
    achieved: "text-green-500",
    abandoned: "text-muted-foreground",
    superseded: "text-muted-foreground",
  };

  return (
    <div className={cn("w-full", className)}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 w-full text-left text-sm",
          "hover:border-primary/30 transition-colors"
        )}
      >
        <Target className={cn("h-4 w-4 shrink-0", statusColor[goal.status] ?? "text-primary")} />

        <span className="flex-1 truncate font-medium text-foreground">
          Goal: {goal.goal}
        </span>

        {criteria.length > 0 && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            ({metCount}/{criteria.length} criteria)
          </span>
        )}

        {criteria.length > 0 &&
          (expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
          ))}
      </button>

      {expanded && criteria.length > 0 && (
        <div className="mt-1 ml-6 space-y-1">
          {criteria.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span
                className={cn(
                  "inline-block h-1.5 w-1.5 rounded-full",
                  c.status === "met"
                    ? "bg-green-500"
                    : c.status === "unmet"
                      ? "bg-destructive"
                      : "bg-muted-foreground/30"
                )}
              />
              <span className="truncate">{c.criterion}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
