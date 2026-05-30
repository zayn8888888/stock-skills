"use client";

import { TrendingUp, Search, Scale, Calendar, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

const EXAMPLE_PROMPTS = [
  { key: "nvda", icon: TrendingUp, query: "分析 NVDA" },
  { key: "btc", icon: Search, query: "BTC 市场扫描" },
  { key: "aapl", icon: Scale, query: "AAPL 多空辩论" },
  { key: "events", icon: Calendar, query: "未来一周大事件" },
] as const;

const LABELS = {
  en: {
    title: "Research Desk",
    subtitle: "Ask anything about stocks, markets, or crypto. I'll analyze data, run models, and deliver structured reports.",
    prompts: {
      nvda: "Analyze NVDA",
      btc: "BTC market scan",
      aapl: "AAPL bull/bear debate",
      events: "Next week's events",
    },
  },
  zh: {
    title: "研究工作台",
    subtitle: "提出关于股票、市场或加密货币的问题。我会分析数据、运行模型、输出结构化报告。",
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
        "flex flex-1 flex-col items-center justify-center gap-10 px-4",
        className
      )}
    >
      {/* Hero */}
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center glow-primary">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight">
          {labels.title}
        </h2>
        <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
          {labels.subtitle}
        </p>
      </div>

      {/* Example prompt cards */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
        {EXAMPLE_PROMPTS.map((prompt, i) => {
          const gradients = [
            "from-primary/10 to-primary/5",
            "from-chart-3/10 to-chart-3/5",
            "from-chart-2/10 to-chart-2/5",
            "from-chart-4/10 to-chart-4/5",
          ];
          return (
            <button
              key={prompt.query}
              onClick={() => onPromptClick(prompt.query)}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-border/60 bg-gradient-to-br p-4 text-left",
                "hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all duration-200",
                "group cursor-pointer",
                gradients[i]
              )}
            >
              <div className="h-8 w-8 rounded-lg bg-background/80 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                <prompt.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">
                {labels.prompts[prompt.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Subtle footer hint */}
      <p className="text-xs text-muted-foreground/40 mt-4">
        {language === "zh" ? "按 Enter 发送 · Shift+Enter 换行" : "Press Enter to send · Shift+Enter for new line"}
      </p>
    </div>
  );
}
