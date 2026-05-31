"use client";

import { cn } from "@/lib/utils";
import { Braces, FileText } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

interface ReportTabProps {
  reportMarkdown: string | null;
  resultJson: string | null;
}

export function ReportTab({ reportMarkdown, resultJson }: ReportTabProps) {
  const [showJson, setShowJson] = useState(false);

  if (!reportMarkdown && !resultJson) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No report or result data available for this run.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toggle button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowJson((v) => !v)}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors border",
            showJson
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-foreground border-border hover:bg-muted",
          )}
        >
          {showJson ? (
            <>
              <FileText className="h-4 w-4" />
              View Report
            </>
          ) : (
            <>
              <Braces className="h-4 w-4" />
              View JSON
            </>
          )}
        </button>
      </div>

      {/* Content */}
      {showJson && resultJson ? (
        <pre className="rounded-lg bg-muted p-4 overflow-x-auto text-sm font-mono leading-relaxed">
          {(() => {
            try {
              return JSON.stringify(JSON.parse(resultJson), null, 2);
            } catch {
              return resultJson;
            }
          })()}
        </pre>
      ) : reportMarkdown ? (
        <article className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {reportMarkdown}
          </ReactMarkdown>
        </article>
      ) : resultJson ? (
        <pre className="rounded-lg bg-muted p-4 overflow-x-auto text-sm font-mono leading-relaxed">
          {(() => {
            try {
              return JSON.stringify(JSON.parse(resultJson), null, 2);
            } catch {
              return resultJson;
            }
          })()}
        </pre>
      ) : null}
    </div>
  );
}
