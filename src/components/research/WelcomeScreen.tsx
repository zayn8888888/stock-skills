"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import { Calendar, Scale, Search, TrendingUp } from "lucide-react";
import { Composer, type ComposerProps } from "./Composer";

const EXAMPLE_PROMPTS = [
  { key: "nvda", icon: TrendingUp, query: "分析 NVDA" },
  { key: "btc", icon: Search, query: "BTC 市场扫描" },
  { key: "aapl", icon: Scale, query: "AAPL 多空辩论" },
  { key: "events", icon: Calendar, query: "未来一周大事件" },
] as const;

const LABELS = {
  en: {
    subtitle:
      "Ask anything about stocks, markets, or crypto. I'll analyze data, run models, and deliver structured reports.",
    prompts: {
      nvda: "Analyze NVDA",
      btc: "BTC market scan",
      aapl: "AAPL bull/bear debate",
      events: "Next week's events",
    },
    hint: "Press Enter to send · Shift+Enter for new line",
  },
  zh: {
    subtitle: "提出关于股票、市场或加密货币的问题。我会分析数据、运行模型、输出结构化报告。",
    prompts: {
      nvda: "分析 NVDA",
      btc: "BTC 市场扫描",
      aapl: "AAPL 多空辩论",
      events: "未来一周大事件",
    },
    hint: "按 Enter 发送 · Shift+Enter 换行",
  },
} as const;

interface WelcomeScreenProps
  extends Pick<
    ComposerProps,
    "onSend" | "onStop" | "streaming" | "disabled" | "context" | "onClearContext"
  > {
  onPromptClick: (query: string) => void;
  className?: string;
}

export function WelcomeScreen({
  onSend,
  onStop,
  streaming,
  disabled,
  context,
  onClearContext,
  onPromptClick,
  className,
}: WelcomeScreenProps) {
  const { language } = useLanguage();
  const labels = LABELS[language];

  return (
    <div className={cn("flex h-full flex-col items-center justify-center gap-6 px-4", className)}>
      {/* Subtitle */}
      <p className="text-sm text-muted-foreground max-w-xl text-center leading-relaxed">
        {labels.subtitle}
      </p>

      {/* Centered Composer */}
      <div className="w-full max-w-5xl">
        <Composer
          onSend={onSend}
          onStop={onStop}
          streaming={streaming}
          disabled={disabled}
          context={context}
          onClearContext={onClearContext}
          size="lg"
        />
      </div>

      {/* Example prompt buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-5xl">
        {EXAMPLE_PROMPTS.map((prompt, i) => {
          const gradients = [
            "from-primary/10 to-primary/5",
            "from-chart-3/10 to-chart-3/5",
            "from-chart-2/10 to-chart-2/5",
            "from-chart-4/10 to-chart-4/5",
          ];
          return (
            <button
              type="button"
              key={prompt.query}
              onClick={() => onPromptClick(prompt.query)}
              className={cn(
                "flex items-center gap-2 rounded-xl border border-border/60 bg-gradient-to-br px-3 py-2.5 text-left",
                "hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all duration-200",
                "group cursor-pointer",
                gradients[i],
              )}
            >
              <div className="h-7 w-7 rounded-lg bg-background/80 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                <prompt.icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <span className="text-xs font-medium text-foreground/80 group-hover:text-foreground transition-colors truncate">
                {labels.prompts[prompt.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Hint */}
      <p className="text-xs text-muted-foreground/40">{labels.hint}</p>
    </div>
  );
}
