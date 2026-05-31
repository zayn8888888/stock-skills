"use client";

import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import { Loader2, Paperclip, Plus, Send, Square, Target, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComposerContext {
  ticker?: string;
  goal?: string;
  attachment?: string;
  workflow?: string;
  workflowKey?: string;
}

export interface ComposerProps {
  onSend: (content: string, context?: ComposerContext) => void;
  onStop?: () => void;
  streaming?: boolean;
  disabled?: boolean;
  context?: ComposerContext;
  onClearContext?: (key: keyof ComposerContext) => void;
  size?: "default" | "lg";
  className?: string;
}

// ---------------------------------------------------------------------------
// + Menu items
// ---------------------------------------------------------------------------

const PLUS_MENU_ITEMS = [
  { key: "upload", labelKey: "upload", icon: Upload },
  { key: "attach", labelKey: "attach", icon: Paperclip },
  { key: "goal", labelKey: "goal", icon: Target },
] as const;

// ---------------------------------------------------------------------------
// Workflow pills
// ---------------------------------------------------------------------------

const WORKFLOW_PRESETS = [
  { key: "analyze", labelKey: "analyze" },
  { key: "debate", labelKey: "debate" },
  { key: "scan", labelKey: "scan" },
  { key: "review", labelKey: "review" },
] as const;

// ---------------------------------------------------------------------------
// Inline chip label mapping
// ---------------------------------------------------------------------------

const INLINE_CHIP_LABELS: Record<string, Record<string, string>> = {
  en: {
    ticker: "Ticker",
    goal: "Goal",
    attachment: "Attachment",
    workflow: "Workflow",
    workflowKey: "Workflow",
  },
  zh: {
    ticker: "标的",
    goal: "目标",
    attachment: "附件",
    workflow: "工作流",
    workflowKey: "工作流",
  },
};

const LABELS = {
  en: {
    placeholder: "Ask a research question...",
    upload: "Upload",
    attach: "Attach context",
    goal: "Set goal",
    analyze: "Analyze",
    debate: "Debate",
    scan: "Scan",
    review: "Review",
    moreActions: "More actions",
    stop: "Stop",
    send: "Send",
    remove: "Remove",
    comingSoon: "Coming soon",
  },
  zh: {
    placeholder: "输入研究问题...",
    upload: "上传",
    attach: "附加上下文",
    goal: "设置目标",
    analyze: "分析",
    debate: "辩论",
    scan: "扫描",
    review: "复盘",
    moreActions: "更多操作",
    stop: "停止",
    send: "发送",
    remove: "移除",
    comingSoon: "即将推出",
  },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Composer({
  onSend,
  onStop,
  streaming = false,
  disabled = false,
  context,
  onClearContext,
  size = "default",
  className,
}: ComposerProps) {
  const { language } = useLanguage();
  const labels = LABELS[language];
  const [value, setValue] = useState("");
  const [plusOpen, setPlusOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || streaming || disabled) return;
    onSend(trimmed, context);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, streaming, disabled, onSend, context]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleWorkflowClick = useCallback(
    (workflowKey: string) => {
      const label =
        labels[WORKFLOW_PRESETS.find((w) => w.key === workflowKey)?.labelKey ?? "analyze"];
      // Trigger workflow by sending a special message
      onSend(`/workflow ${workflowKey}`, {
        ...context,
        workflow: label,
        workflowKey,
      });
    },
    [onSend, context, labels],
  );

  // Close + menu on outside click
  const handlePlusBlur = useCallback(() => {
    // Use setTimeout so click on menu item registers first
    setTimeout(() => setPlusOpen(false), 150);
  }, []);

  const handlePlusItemClick = useCallback((key: string) => {
    setPlusOpen(false);
    if (key === "upload") {
      fileInputRef.current?.click();
    } else {
      // Attach context / Set goal — not yet implemented
      textareaRef.current?.focus();
    }
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setValue((prev) =>
          prev
            ? `${prev}\n[Uploaded: ${data.original_filename}]`
            : `[Uploaded: ${data.original_filename}]`,
        );
        textareaRef.current?.focus();
      }
    } catch {
      // silently fail
    }
  }, []);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Context chips */}
      {context && onClearContext && (
        <ContextChipsInline
          context={context}
          onClear={onClearContext}
          removeLabel={labels.remove}
          language={language}
        />
      )}

      {/* Input area */}
      <div
        className={cn(
          "flex gap-2 rounded-2xl border border-border/60 bg-card p-2",
          "focus-within:border-primary/40 focus-within:shadow-sm focus-within:shadow-primary/5 transition-all duration-200",
          size === "lg" ? "items-start" : "items-end",
        )}
      >
        {/* + Menu */}
        <div className="relative" ref={plusMenuRef} onBlur={handlePlusBlur}>
          <button
            type="button"
            onClick={() => setPlusOpen((v) => !v)}
            disabled={disabled}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
              plusOpen
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-label={labels.moreActions}
          >
            <Plus className="h-4 w-4" />
          </button>

          {plusOpen && (
            <div className="absolute bottom-full left-0 mb-1 w-44 rounded-md border border-border bg-popover shadow-md z-50">
              {PLUS_MENU_ITEMS.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handlePlusItemClick(item.key);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent transition-colors"
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  {labels[item.labelKey]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hidden file input */}
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={labels.placeholder}
          disabled={disabled}
          rows={size === "lg" ? 3 : 1}
          className={cn(
            "flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground",
            "outline-none border-none focus:ring-0",
            size === "lg"
              ? "min-h-[80px] max-h-[240px] py-2 placeholder:leading-relaxed"
              : "min-h-[32px] max-h-[200px] py-1",
          )}
        />

        {/* Send / Stop button */}
        {streaming || disabled ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            aria-label={labels.stop}
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
              value.trim() && !disabled
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
            aria-label={labels.send}
          >
            {disabled ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Workflow pill bar */}
      <div className="flex items-center gap-1.5">
        {WORKFLOW_PRESETS.map((wf) => (
          <button
            type="button"
            key={wf.key}
            onClick={() => handleWorkflowClick(wf.key)}
            disabled={streaming || disabled}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              "border border-border text-muted-foreground",
              "hover:border-primary hover:text-primary hover:bg-primary/5",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {labels[wf.labelKey]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Context Chips (inside composer)
// ---------------------------------------------------------------------------

interface ContextChipsInlineProps {
  context: ComposerContext;
  onClear: (key: keyof ComposerContext) => void;
  removeLabel?: string;
  language?: string;
}

function ContextChipsInline({ context, onClear, removeLabel, language }: ContextChipsInlineProps) {
  const entries = Object.entries(context).filter(([, v]) => v !== undefined && v !== "") as [
    keyof ComposerContext,
    string,
  ][];

  if (entries.length === 0) return null;

  const chipLabels = INLINE_CHIP_LABELS[language ?? "en"] ?? INLINE_CHIP_LABELS.en;

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
        >
          {chipLabels[key] ?? key}: {value}
          <button
            type="button"
            onClick={() => onClear(key)}
            className="ml-0.5 hover:text-destructive transition-colors"
            aria-label={`${removeLabel ?? "Remove"} ${chipLabels[key] ?? key}`}
          >
            &times;
          </button>
        </span>
      ))}
    </div>
  );
}
