"use client";

import { FileText, BarChart3, Database, Box, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArtifactCardData {
  id: string;
  kind: string; // report | chart | data | model
  name: string;
  mime_type?: string | null;
  content?: string | null;
  path?: string | null;
  created_at?: string;
}

interface ArtifactCardProps {
  artifact: ArtifactCardData;
  onView?: (artifact: ArtifactCardData) => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Kind config
// ---------------------------------------------------------------------------

const KIND_ICON: Record<string, typeof FileText> = {
  report: FileText,
  chart: BarChart3,
  data: Database,
  model: Box,
};

const KIND_COLOR: Record<string, string> = {
  report: "text-blue-500",
  chart: "text-green-500",
  data: "text-amber-500",
  model: "text-purple-500",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArtifactCard({ artifact, onView, className }: ArtifactCardProps) {
  const Icon = KIND_ICON[artifact.kind] ?? FileText;
  const color = KIND_COLOR[artifact.kind] ?? "text-muted-foreground";

  return (
    <button
      onClick={() => onView?.(artifact)}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 w-full text-left",
        "hover:border-primary/50 hover:bg-primary/5 transition-colors",
        "group text-sm",
        className
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", color)} />

      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground truncate">{artifact.name}</p>
        <p className="text-xs text-muted-foreground">
          {artifact.kind}
          {artifact.mime_type && ` (${artifact.mime_type})`}
        </p>
      </div>

      <ExternalLink className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
    </button>
  );
}
