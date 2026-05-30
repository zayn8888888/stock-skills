"use client";

import { TrendingUp, Search, Scale, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Example prompts
// ---------------------------------------------------------------------------

const EXAMPLE_PROMPTS = [
  { label: "分析 NVDA", icon: TrendingUp, query: "分析 NVDA" },
  { label: "BTC 市场扫描", icon: Search, query: "BTC 市场扫描" },
  { label: "AAPL 多空辩论", icon: Scale, query: "AAPL 多空辩论" },
  { label: "未来一周大事件", icon: Calendar, query: "未来一周大事件" },
] as const;

interface WelcomeScreenProps {
  onPromptClick: (query: string) => void;
  className?: string;
}

export function WelcomeScreen({ onPromptClick, className }: WelcomeScreenProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-8 px-4",
        className
      )}
    >
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Research Desk
        </h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Start a research session by asking a question or picking an example
          below.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt.query}
            onClick={() => onPromptClick(prompt.query)}
            className={cn(
              "flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-left",
              "hover:border-primary hover:bg-primary/5 transition-colors",
              "group"
            )}
          >
            <prompt.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            <span className="text-sm text-foreground">{prompt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
