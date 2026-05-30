"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/common/DataTable";

interface RunEvent {
  event_id: string;
  event_type: string;
  timestamp: string;
  data: Record<string, unknown> | null;
}

interface LogsTabProps {
  events: RunEvent[];
}

const severityColors: Record<string, string> = {
  error: "text-destructive",
  warn: "text-warning",
  warning: "text-warning",
  info: "text-muted-foreground",
  debug: "text-muted-foreground/60",
};

function inferSeverity(eventType: string, data: Record<string, unknown> | null): string {
  if (data && typeof data.severity === "string") return data.severity;
  if (eventType === "error") return "error";
  return "info";
}

function extractMessage(data: Record<string, unknown> | null): string {
  if (!data) return "";
  if (typeof data.message === "string") return data.message;
  if (typeof data.error === "string") return data.error;
  return JSON.stringify(data);
}

export function LogsTab({ events }: LogsTabProps) {
  const columns: ColumnDef<RunEvent>[] = useMemo(
    () => [
      {
        accessorKey: "timestamp",
        header: "Timestamp",
        cell: ({ row }) => (
          <code className="text-xs font-mono">
            {new Date(row.original.timestamp).toLocaleString()}
          </code>
        ),
      },
      {
        accessorKey: "event_type",
        header: "Event Type",
        cell: ({ row }) => (
          <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs font-medium">
            {row.original.event_type}
          </span>
        ),
      },
      {
        id: "severity",
        header: "Severity",
        cell: ({ row }) => {
          const severity = inferSeverity(
            row.original.event_type,
            row.original.data
          );
          return (
            <span
              className={`text-xs font-medium ${severityColors[severity] ?? "text-muted-foreground"}`}
            >
              {severity}
            </span>
          );
        },
      },
      {
        id: "message",
        header: "Message",
        cell: ({ row }) => (
          <span className="text-sm text-foreground line-clamp-2">
            {extractMessage(row.original.data)}
          </span>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {events.length} event(s)
      </p>
      <DataTable columns={columns} data={events} pageSize={20} />
    </div>
  );
}
