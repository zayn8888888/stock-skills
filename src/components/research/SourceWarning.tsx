"use client";

import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SourceWarningProps {
  message: string;
  onDismiss?: () => void;
  className?: string;
}

export function SourceWarning({ message, onDismiss, className }: SourceWarningProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-foreground",
        className
      )}
    >
      <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-warning/70 hover:text-warning transition-colors"
          aria-label="Dismiss warning"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
