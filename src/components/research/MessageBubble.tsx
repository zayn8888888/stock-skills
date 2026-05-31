"use client";

import { MarkdownContent } from "@/components/common/MarkdownContent";
import { cn } from "@/lib/utils";
import type { AgentMessage } from "@/stores/agent";
import { BarChart3, Bot, Box, Database, ExternalLink, FileText, User } from "lucide-react";

// ── Artifact icons ─────────────────────────────────────────────────

const KIND_ICONS: Record<string, typeof FileText> = {
  report: FileText,
  chart: BarChart3,
  data: Database,
  model: Box,
};

// ── Main Component ─────────────────────────────────────────────────

interface MessageBubbleProps {
  message: AgentMessage;
  streaming?: boolean;
}

export function MessageBubble({ message, streaming = false }: MessageBubbleProps) {
  const { role, content, artifacts } = message;

  // ── User message ────────────────────────────────────────────────
  if (role === "user") {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-sm">
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        </div>
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
          <User className="h-3.5 w-3.5 text-primary" />
        </div>
      </div>
    );
  }

  // ── System message ──────────────────────────────────────────────
  if (role === "system") {
    return (
      <div className="flex justify-center my-2">
        <div className="max-w-[80%] rounded-full bg-muted/40 border border-border/50 px-4 py-1.5 text-center text-xs text-muted-foreground">
          {content}
        </div>
      </div>
    );
  }

  // ── Assistant message ───────────────────────────────────────────

  return (
    <div className="flex gap-2 items-start">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center mt-0.5">
        <Bot className="h-3.5 w-3.5 text-primary" />
      </div>

      <div className="flex flex-col gap-2 flex-1 min-w-0">
        {/* Main content */}
        {content && <MarkdownContent content={content} streaming={streaming} />}

        {/* Artifact cards */}
        {artifacts && artifacts.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {artifacts.map((artifact) => {
              const Icon = KIND_ICONS[artifact.kind] ?? FileText;
              return (
                <div
                  key={artifact.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-border/50 bg-card px-3 py-2.5",
                    "hover:border-primary/40 hover:bg-primary/5 transition-all text-sm group cursor-pointer",
                  )}
                >
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate text-sm">{artifact.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {artifact.kind}
                      {artifact.mimeType && ` · ${artifact.mimeType}`}
                    </p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
