"use client";

import { useCallback, useRef, useState } from "react";
import {
  Plus,
  Send,
  Square,
  Upload,
  Paperclip,
  Target,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComposerContext {
  ticker?: string;
  goal?: string;
  attachment?: string;
  workflow?: string;
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

  // Auto-resize textarea
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    },
    []
  );

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
    [handleSend]
  );

  const handleWorkflowClick = useCallback(
    (workflowKey: string) => {
      const label =
        labels[
          WORKFLOW_PRESETS.find((w) => w.key === workflowKey)?.labelKey ??
            "analyze"
        ];
      // Trigger workflow by sending a special message
      onSend(`/workflow ${workflowKey}`, {
        ...context,
        workflow: label,
      });
    },
    [onSend, context, labels]
  );

  // Close + menu on outside click
  const handlePlusBlur = useCallback(() => {
    // Use setTimeout so click on menu item registers first
    setTimeout(() => setPlusOpen(false), 150);
  }, []);

  const handlePlusItemClick = useCallback(
    (key: string) => {
      setPlusOpen(false);
      // Focus textarea after action
      textareaRef.current?.focus();
      // For now, these are placeholders - the actual implementation
      // would open file pickers, context panels, etc.
    },
    []
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* Context chips */}
      {context && onClearContext && (
        <ContextChipsInline context={context} onClear={onClearContext} />
      )}

      {/* Input area */}
      <div className={cn(
        "flex gap-2 rounded-2xl border border-border/60 bg-card p-2",
        "focus-within:border-primary/40 focus-within:shadow-sm focus-within:shadow-primary/5 transition-all duration-200",
        size === "lg" ? "items-start" : "items-end"
      )}>
        {/* + Menu */}
        <div className="relative" ref={plusMenuRef} onBlur={handlePlusBlur}>
          <button
            onClick={() => setPlusOpen((v) => !v)}
            disabled={disabled}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
              plusOpen
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            aria-label="More actions"
          >
            <Plus className="h-4 w-4" />
          </button>

          {plusOpen && (
            <div className="absolute bottom-full left-0 mb-1 w-44 rounded-md border border-border bg-popover shadow-md z-50">
              {PLUS_MENU_ITEMS.map((item) => (
                <button
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
              : "min-h-[32px] max-h-[200px] py-1"
          )}
        />

        {/* Send / Stop button */}
        {streaming ? (
          <button
            onClick={onStop}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
            aria-label="Stop"
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
              value.trim() && !disabled
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
            aria-label="Send"
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
            key={wf.key}
            onClick={() => handleWorkflowClick(wf.key)}
            disabled={streaming || disabled}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              "border border-border text-muted-foreground",
              "hover:border-primary hover:text-primary hover:bg-primary/5",
              "disabled:opacity-50 disabled:cursor-not-allowed"
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
}

function ContextChipsInline({ context, onClear }: ContextChipsInlineProps) {
  const entries = Object.entries(context).filter(
    ([, v]) => v !== undefined && v !== ""
  ) as [keyof ComposerContext, string][];

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
        >
          {key}: {value}
          <button
            onClick={() => onClear(key)}
            className="ml-0.5 hover:text-destructive transition-colors"
            aria-label={`Remove ${key}`}
          >
            &times;
          </button>
        </span>
      ))}
    </div>
  );
}
