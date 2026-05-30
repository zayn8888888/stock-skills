"use client";

import { TrendingUp, Search, Scale, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

// ---------------------------------------------------------------------------
// Example prompts
// ---------------------------------------------------------------------------

const EXAMPLE_PROMPTS = [
  { key: "nvda", icon: TrendingUp, query: "分析 NVDA" },
  { key: "btc", icon: Search, query: "BTC 市场扫描" },
  { key: "aapl", icon: Scale, query: "AAPL 多空辩论" },
  { key: "events", icon: Calendar, query: "未来一周大事件" },
] as const;

const LABELS = {
  en: {
    title: "Research Desk",
    subtitle:
      "Start a research session by asking a question or picking an example below.",
    prompts: {
      nvda: "Analyze NVDA",
      btc: "BTC market scan",
      aapl: "AAPL bull/bear debate",
      events: "Next week's events",
    },
  },
  zh: {
    title: "研究工作台",
    subtitle: "输入一个研究问题，或从下面选择一个示例开始。",
    prompts: {
      nvda: "分析 NVDA",
      btc: "BTC 市场扫描",
      aapl: "AAPL 多空辩论",
      events: "未来一周大事件",
    },
  },
} as const;

interface WelcomeScreenProps {
  onPromptClick: (query: string) => void;
  className?: string;
}

export function WelcomeScreen({ onPromptClick, className }: WelcomeScreenProps) {
  const { language } = useLanguage();
  const labels = LABELS[language];

  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-8 px-4",
        className
      )}
    >
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground mb-2">
          {labels.title}
        </h2>
        <p className="text-sm text-muted-foreground max-w-md">
          {labels.subtitle}
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
            <span className="text-sm text-foreground">
              {labels.prompts[prompt.key]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
