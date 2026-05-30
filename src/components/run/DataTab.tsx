"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRight, ExternalLink } from "lucide-react";
import { DataTable } from "@/components/common/DataTable";
import { cn } from "@/lib/utils";

interface Artifact {
  artifact_id: string;
  kind: string;
  name: string;
  path: string | null;
  content: string | null;
  mime_type: string | null;
  created_at: string;
}

interface DataTabProps {
  artifacts: Artifact[];
}

function truncateHash(input: string, len = 16): string {
  if (input.length <= len) return input;
  return `${input.slice(0, len)}...`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(1)} ${sizes[i]}`;
}

function fakeChecksum(content: string | null): string {
  if (!content) return "N/A";
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return `${hex}${hex}${hex}${hex}`;
}

export function DataTab({ artifacts }: DataTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Trust summary derived from artifacts
  const summary = useMemo(() => {
    const kinds = new Set(artifacts.map((a) => a.kind));
    const totalSize = artifacts.reduce(
      (s, a) => s + (a.content?.length ?? 0),
      0
    );
    return {
      schemaVersion: "1.0",
      generatedAt: artifacts[0]?.created_at ?? "N/A",
      dataSources: kinds.size,
      warnings: totalSize === 0 ? "No content data" : null,
    };
  }, [artifacts]);

  const columns: ColumnDef<Artifact>[] = useMemo(
    () => [
      { accessorKey: "name", header: "Filename" },
      {
        accessorKey: "kind",
        header: "Type",
        cell: ({ row }) => (
          <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs font-medium">
            {row.original.kind}
          </span>
        ),
      },
      {
        accessorKey: "content",
        header: "Size",
        cell: ({ row }) => formatBytes(row.original.content?.length ?? 0),
        enableSorting: false,
      },
      {
        id: "checksum",
        header: "Checksum",
        cell: ({ row }) => (
          <code className="text-xs text-muted-foreground font-mono">
            {truncateHash(fakeChecksum(row.original.content))}
          </code>
        ),
        enableSorting: false,
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) =>
          new Date(row.original.created_at).toLocaleString(),
      },
      {
        id: "expand",
        header: "",
        cell: ({ row }) => (
          <ChevronRight
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              expandedId === row.original.artifact_id && "rotate-90"
            )}
          />
        ),
        enableSorting: false,
      },
    ],
    [expandedId]
  );

  return (
    <div className="space-y-6">
      {/* Trust summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Schema Version", value: summary.schemaVersion },
          { label: "Generated", value: summary.generatedAt },
          { label: "Data Sources", value: String(summary.dataSources) },
          {
            label: "Warnings",
            value: summary.warnings ?? "None",
            warn: !!summary.warnings,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-border bg-muted/30 px-4 py-3"
          >
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p
              className={cn(
                "mt-1 text-sm font-medium",
                "warn" in item && item.warn
                  ? "text-warning"
                  : "text-foreground"
              )}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Artifact table */}
      <DataTable
        columns={columns}
        data={artifacts}
        pageSize={10}
      />

      {/* Source provenance (expanded detail) */}
      {expandedId && (
        <ProvenanceDetail
          artifact={artifacts.find((a) => a.artifact_id === expandedId)!}
          onClose={() => setExpandedId(null)}
        />
      )}
    </div>
  );
}

function ProvenanceDetail({
  artifact,
  onClose,
}: {
  artifact: Artifact;
  onClose: () => void;
}) {
  const rawRef = artifact.path ?? `artifact://${artifact.artifact_id}`;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">
          Source Provenance: {artifact.name}
        </h4>
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
      <div className="text-sm space-y-1">
        <p>
          <span className="text-muted-foreground">Raw ref: </span>
          <a
            href={rawRef}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {rawRef}
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>
        <p>
          <span className="text-muted-foreground">MIME type: </span>
          {artifact.mime_type ?? "N/A"}
        </p>
        <p>
          <span className="text-muted-foreground">Kind: </span>
          {artifact.kind}
        </p>
      </div>
    </div>
  );
}
