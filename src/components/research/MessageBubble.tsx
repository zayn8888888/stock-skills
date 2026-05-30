"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  FileText,
  BarChart3,
  Database,
  Box,
  ExternalLink,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Bot,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentMessage } from "@/stores/agent";

// ── Artifact icons ─────────────────────────────────────────────────

const KIND_ICONS: Record<string, typeof FileText> = {
  report: FileText,
  chart: BarChart3,
  data: Database,
  model: Box,
};

// ── Copy button for code blocks ────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="absolute top-2 right-2 p-1 rounded bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
      aria-label="Copy code"
    >
      {copied ? <Check className="h-3 w-3 text-gain" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

// ── Collapsible section (for long content) ─────────────────────────

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </button>
      {open && <div className="border-t border-border px-3 py-2">{children}</div>}
    </div>
  );
}

// ── Custom markdown components (vibe trading style) ────────────────

const markdownComponents: Components = {
  // Headings with accent border
  h1: ({ children, ...props }) => (
    <h1
      className="text-lg font-bold text-foreground border-b border-primary/30 pb-1.5 mb-3 mt-4 first:mt-0"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      className="text-base font-semibold text-foreground flex items-center gap-2 mb-2 mt-3 first:mt-0"
      {...props}
    >
      <span className="inline-block w-1 h-4 bg-primary rounded-full" />
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      className="text-sm font-semibold text-foreground/90 mb-1.5 mt-2 first:mt-0"
      {...props}
    >
      {children}
    </h3>
  ),

  // Tables with proper styling
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-3 rounded-md border border-border">
      <table className="w-full text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-muted/50" {...props}>
      {children}
    </thead>
  ),
  tr: ({ children, ...props }) => (
    <tr
      className="last:[&_td]:border-b-0"
      {...props}
    >
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th
      className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td
      className="px-3 py-2 text-sm border-b border-border/50"
      {...props}
    >
      {children}
    </td>
  ),

  // Code blocks with copy button
  pre: ({ children, ...props }) => {
    const codeText =
      typeof children === "object" && children !== null && "props" in children
        ? (children.props as { children?: string }).children ?? ""
        : "";
    return (
      <div className="relative group my-3 rounded-lg border border-border overflow-hidden">
        <CopyButton text={codeText} />
        <pre
          className="bg-muted p-4 overflow-x-auto text-sm leading-relaxed"
          {...props}
        >
          {children}
        </pre>
      </div>
    );
  },

  // Inline code
  code: ({ children, className, ...props }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className={cn("text-sm", className)} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="bg-muted/60 text-primary/90 px-1.5 py-0.5 rounded text-xs font-mono border border-border/50"
        {...props}
      >
        {children}
      </code>
    );
  },

  // Blockquotes with accent
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-2 border-primary pl-4 py-1 my-3 text-muted-foreground italic bg-primary/5 rounded-r-md"
      {...props}
    >
      {children}
    </blockquote>
  ),

  // Horizontal rules
  hr: ({ ...props }) => (
    <hr className="my-4 border-border" {...props} />
  ),

  // Links
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60 transition-colors"
      {...props}
    >
      {children}
    </a>
  ),

  // Lists
  ul: ({ children, ...props }) => (
    <ul className="list-none space-y-1 my-2" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal list-inside space-y-1 my-2 marker:text-primary marker:font-mono marker:text-xs" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-sm leading-relaxed flex gap-2" {...props}>
      <span className="text-primary mt-1.5 text-[8px]">●</span>
      <span>{children}</span>
    </li>
  ),

  // Strong / emphasis
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-foreground" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic text-muted-foreground" {...props}>
      {children}
    </em>
  ),

  // Paragraphs
  p: ({ children, ...props }) => (
    <p className="text-sm leading-relaxed my-1.5 first:mt-0 last:mb-0" {...props}>
      {children}
    </p>
  ),
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
        {content && (
          <div
            className={cn(
              "rounded-2xl rounded-tl-md px-4 py-3",
              "bg-card border border-border/50 shadow-sm",
              "prose prose-sm max-w-none",
              "prose-pre:p-0 prose-pre:border-0 prose-pre:bg-transparent",
              "prose-table:my-0"
            )}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={markdownComponents}
            >
              {content}
            </ReactMarkdown>

            {/* Streaming cursor */}
            {streaming && (
              <span className="inline-block w-1.5 h-4 bg-primary animate-stream-cursor ml-0.5 align-text-bottom rounded-sm" />
            )}
          </div>
        )}

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
                    "hover:border-primary/40 hover:bg-primary/5 transition-all text-sm group cursor-pointer"
                  )}
                >
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate text-sm">
                      {artifact.name}
                    </p>
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
