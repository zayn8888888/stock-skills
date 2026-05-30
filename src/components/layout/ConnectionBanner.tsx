"use client";

import { useAgentStore } from "@/stores/agent";

export function ConnectionBanner() {
  const sseStatus = useAgentStore((s) => s.sseStatus);
  const retryAttempt = useAgentStore((s) => s.sseRetryAttempt);

  if (sseStatus !== "reconnecting") return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-warning/15 border-b border-warning/30 px-4 py-2 text-sm text-warning-foreground">
      <span className="inline-block h-2 w-2 rounded-full bg-warning animate-pulse" />
      <span>
        Connection lost &mdash; reconnecting
        {retryAttempt > 0 ? ` (attempt ${retryAttempt})` : "…"}
      </span>
    </div>
  );
}
