"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";
import type { AgentMessage } from "@/stores/agent";

interface MessageBubbleProps {
  message: AgentMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { role, content } = message;

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

  // assistant (and tool roles rendered as assistant context)
  return (
    <div className="flex justify-start">
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
    </div>
  );
}
