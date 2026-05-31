"use client";

import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

// ── Copy button for code blocks ────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
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
    <h3 className="text-sm font-semibold text-foreground/90 mb-1.5 mt-2 first:mt-0" {...props}>
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
    <tr className="last:[&_td]:border-b-0" {...props}>
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
    <td className="px-3 py-2 text-sm border-b border-border/50" {...props}>
      {children}
    </td>
  ),

  // Code blocks with copy button
  pre: ({ children, ...props }) => {
    const codeText =
      typeof children === "object" && children !== null && "props" in children
        ? ((children.props as { children?: string }).children ?? "")
        : "";
    return (
      <div className="relative group my-3 rounded-lg border border-border overflow-hidden">
        <CopyButton text={codeText} />
        <pre className="bg-muted p-4 overflow-x-auto text-sm leading-relaxed" {...props}>
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
  hr: ({ ...props }) => <hr className="my-4 border-border" {...props} />,

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
    <ol
      className="list-decimal list-inside space-y-1 my-2 marker:text-primary marker:font-mono marker:text-xs"
      {...props}
    >
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

// ── Streaming markdown patcher ─────────────────────────────────────
// Closes incomplete markdown structures so react-markdown can render
// partial content during streaming without breaking.

function patchStreamingMarkdown(md: string): string {
  let patched = md;

  // Count unclosed fenced code blocks
  const fences = patched.match(/^```/gm);
  if (fences && fences.length % 2 !== 0) {
    patched += "\n```";
  }

  // Close incomplete table — if we have | header | but no body rows yet,
  // add a separator row if missing
  const lines = patched.split("\n");
  let inTable = false;
  let tableHasSeparator = false;
  for (const line of lines) {
    if (/^\|.*\|$/.test(line.trim())) {
      if (!inTable) {
        inTable = true;
        tableHasSeparator = false;
      } else if (/^\|[\s\-:|]+\|$/.test(line.trim())) {
        tableHasSeparator = true;
      }
    } else if (inTable && line.trim() === "") {
      inTable = false;
      tableHasSeparator = false;
    }
  }
  // If we're in a table with a header but no separator, add one
  if (inTable && !tableHasSeparator) {
    const lastTableLineIdx = lines.reduce((acc, l, i) => (/^\|.*\|$/.test(l.trim()) ? i : acc), -1);
    if (lastTableLineIdx >= 0) {
      const cols = (lines[lastTableLineIdx].match(/\|/g)?.length ?? 2) - 1;
      const sep = `|${Array(cols).fill(" --- |").join("")}`;
      lines.splice(lastTableLineIdx + 1, 0, sep);
      patched = lines.join("\n");
    }
  }

  return patched;
}

// ── MarkdownContent ────────────────────────────────────────────────
// Shared renderer used by both MessageBubble (finalized) and
// Timeline's StreamingContent (in-flight).  Keeping one renderer
// ensures headings, tables, lists, code blocks and links look
// identical in both states.

interface MarkdownContentProps {
  content: string;
  streaming?: boolean;
  className?: string;
}

export function MarkdownContent({ content, streaming = false, className }: MarkdownContentProps) {
  const renderedContent = useMemo(
    () => (streaming ? patchStreamingMarkdown(content) : content),
    [content, streaming],
  );

  return (
    <div
      className={cn(
        "rounded-2xl rounded-tl-md px-4 py-3",
        "bg-card border border-border/50 shadow-sm",
        "prose prose-sm max-w-none",
        "prose-pre:p-0 prose-pre:border-0 prose-pre:bg-transparent",
        "prose-table:my-0",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={markdownComponents}
      >
        {renderedContent}
      </ReactMarkdown>

      {/* Streaming cursor */}
      {streaming && (
        <span className="inline-block w-1.5 h-4 bg-primary animate-stream-cursor ml-0.5 align-text-bottom rounded-sm" />
      )}
    </div>
  );
}
