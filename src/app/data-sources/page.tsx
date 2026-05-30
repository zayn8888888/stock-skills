"use client";

import { useEffect, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Database, RefreshCw } from "lucide-react";
import { DataTable } from "@/components/common/DataTable";
import { Skeleton } from "@/components/common/Skeleton";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { cn } from "@/lib/utils";

interface DataSource {
  id: string;
  name: string;
  type: string;
  status: string;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

const statusColors: Record<string, string> = {
  active: "bg-green-500",
  inactive: "bg-muted-foreground/40",
  error: "bg-destructive",
  unknown: "bg-muted-foreground/20",
};

export default function DataSourcesPage() {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/data-sources/health")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: DataSource[]) => {
        setSources(data);
        setEnabled(Object.fromEntries(data.map((s) => [s.id, s.status === "active"])));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toggleEnabled = (id: string) => {
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const columns: ColumnDef<DataSource>[] = [
    { accessorKey: "name", header: "Name" },
    {
      accessorKey: "type",
      header: "Kind",
      cell: ({ row }) => (
        <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs font-medium">
          {row.original.type}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              statusColors[row.original.status] ?? statusColors.unknown
            )}
          />
          <span className="text-sm capitalize">{row.original.status}</span>
        </span>
      ),
    },
    {
      accessorKey: "last_sync_at",
      header: "Last Checked",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.last_sync_at
            ? new Date(row.original.last_sync_at).toLocaleString()
            : "Never"}
        </span>
      ),
    },
    {
      id: "enabled",
      header: "Enabled",
      cell: ({ row }) => {
        const on = enabled[row.original.id] ?? false;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleEnabled(row.original.id);
            }}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
              on ? "bg-primary" : "bg-muted"
            )}
            role="switch"
            aria-checked={on}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg transition-transform",
                on ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        );
      },
      enableSorting: false,
    },
  ];

  return (
    <ErrorBoundary>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold text-foreground">
              Data Sources
            </h1>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {loading ? (
          <Skeleton variant="card" className="h-64" />
        ) : (
          <DataTable columns={columns} data={sources} pageSize={15} />
        )}
      </div>
    </ErrorBoundary>
  );
}
