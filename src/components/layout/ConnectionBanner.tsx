"use client";

import { useAgentStore } from "@/stores/agent";
import { useLanguage } from "@/hooks/useLanguage";

const LABELS = {
  en: {
    connectionLost: "Connection lost — reconnecting",
    attempt: "attempt",
  },
  zh: {
    connectionLost: "连接断开 — 正在重连",
    attempt: "第",
  },
} as const;

export function ConnectionBanner() {
  const sseStatus = useAgentStore((s) => s.sseStatus);
  const retryAttempt = useAgentStore((s) => s.sseRetryAttempt);
  const { language } = useLanguage();
  const labels = LABELS[language];

  if (sseStatus !== "reconnecting") return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-warning/15 border-b border-warning/30 px-4 py-2 text-sm text-warning-foreground">
      <span className="inline-block h-2 w-2 rounded-full bg-warning animate-pulse" />
      <span>
        {labels.connectionLost}
        {retryAttempt > 0
          ? language === "zh"
            ? ` (${labels.attempt} ${retryAttempt} 次)`
            : ` (${labels.attempt} ${retryAttempt})`
          : "…"}
      </span>
    </div>
  );
}
