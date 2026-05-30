"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { FileText, BarChart3, Database, Box, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentMessage } from "@/stores/agent";

const KIND_ICONS: Record<string, typeof FileText> = {
  report: FileText,
  chart: BarChart3,
  data: Database,
  model: Box,
};

interface MessageBubbleProps {
  message: AgentMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { role, content, artifacts } = message;

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-lg bg-primary px-4 py-2 text-primary-foreground">
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        </div>
      </div>
    );
  }

  if (role === "system") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[80%] rounded-md bg-muted/50 px-3 py-1.5 text-center text-xs text-muted-foreground">
          {content}
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="flex flex-col gap-2 items-start">
      <div
        className={cn(
          "max-w-[85%] rounded-lg bg-card px-4 py-3 text-card-foreground",
          "prose prose-sm dark:prose-invert max-w-none",
          "prose-pre:bg-muted prose-pre:text-sm",
          "prose-code:before:hidden prose-code:after:hidden",
          "prose-table:text-sm",
          "prose-th:px-2 prose-th:py-1",
          "prose-td:px-2 prose-td:py-1"
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
        >
          {content}
        </ReactMarkdown>
      </div>

      {/* Artifact cards */}
      {artifacts && artifacts.length > 0 && (
        <div className="flex flex-col gap-1.5 max-w-[85%]">
          {artifacts.map((artifact) => {
            const Icon = KIND_ICONS[artifact.kind] ?? FileText;
            return (
              <div
                key={artifact.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2",
                  "hover:border-primary/50 hover:bg-primary/5 transition-colors text-sm"
                )}
              >
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {artifact.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {artifact.kind}
                    {artifact.mimeType && ` (${artifact.mimeType})`}
                  </p>
                </div>
                <ExternalLink className="h-3 w-3 text-muted-foreground/50 shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
