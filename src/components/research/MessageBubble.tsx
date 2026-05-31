"use client";

import { MarkdownContent } from "@/components/common/MarkdownContent";
import type { AgentMessage } from "@/stores/agent";
import { Bot, User } from "lucide-react";
import { ArtifactCard } from "./ArtifactCard";

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
            {artifacts.map((artifact) => (
              <ArtifactCard
                key={artifact.id}
                artifact={{
                  id: artifact.id,
                  kind: artifact.kind,
                  name: artifact.name,
                  mime_type: artifact.mimeType,
                  path: artifact.path,
                  content: artifact.content,
                }}
                onView={(a) => {
                  if (a.path) window.open(a.path, "_blank");
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
