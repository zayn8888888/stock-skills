"use client";

import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Skeleton } from "@/components/common/Skeleton";
import { DataTab } from "@/components/run/DataTab";
import { LogsTab } from "@/components/run/LogsTab";
import { ReportTab } from "@/components/run/ReportTab";
import { cn } from "@/lib/utils";
import * as Tabs from "@radix-ui/react-tabs";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  Loader2,
  ScrollText,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface RunDetail {
  run_id: string;
  session_id: string;
  goal_id: string | null;
  skill_name: string;
  status: string;
  workflow_type: string | null;
  ticker: string | null;
  market: string | null;
  intent: string | null;
  execution_mode: string | null;
  caller: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  result_summary: string | null;
  artifacts: {
    artifact_id: string;
    kind: string;
    name: string;
    path: string | null;
    content: string | null;
    mime_type: string | null;
    created_at: string;
  }[];
  events: {
    event_id: string;
    event_type: string;
    timestamp: string;
    data: Record<string, unknown> | null;
  }[];
}

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  success: { icon: CheckCircle2, color: "text-green-500", label: "Success" },
  failed: { icon: XCircle, color: "text-destructive", label: "Failed" },
  running: { icon: Loader2, color: "text-blue-500", label: "Running" },
  pending: { icon: Clock, color: "text-muted-foreground", label: "Pending" },
  cancelled: { icon: XCircle, color: "text-muted-foreground", label: "Cancelled" },
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "N/A";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.runId as string;

  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    setLoading(true);
    fetch(`/api/runs/${runId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Run not found (${r.status})`);
        return r.json();
      })
      .then((data: RunDetail) => {
        setRun(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [runId]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton variant="heading" />
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <XCircle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground">{error ?? "Run not found"}</p>
        <Link
          href="/"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Research Desk
        </Link>
      </div>
    );
  }

  const st = statusConfig[run.status] ?? statusConfig.pending;
  const StatusIcon = st.icon;

  const reportArtifact = run.artifacts.find((a) => a.name === "report.md" || a.kind === "report");
  const resultArtifact = run.artifacts.find((a) => a.name === "result.json");

  return (
    <ErrorBoundary>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="h-3 w-3" />
            Research Desk
          </Link>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-3">
            {run.skill_name}
            <span className="flex items-center gap-1.5 text-sm font-normal">
              <StatusIcon
                className={cn("h-4 w-4", st.color, {
                  "animate-spin": run.status === "running",
                })}
              />
              <span className={st.color}>{st.label}</span>
            </span>
          </h1>
        </div>

        {/* Meta cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Run ID", value: run.run_id.slice(0, 8) },
            { label: "Skill", value: run.skill_name },
            { label: "Ticker", value: run.ticker ?? "N/A" },
            { label: "Duration", value: formatDuration(run.duration_ms) },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-border bg-muted/30 px-4 py-2.5"
            >
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-0.5 text-sm font-medium text-foreground truncate">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <Tabs.Root defaultValue="report" className="w-full">
          <Tabs.List className="flex gap-1 border-b border-border">
            {[
              { value: "report", label: "Report", icon: FileText },
              { value: "data", label: "Data", icon: Database },
              { value: "logs", label: "Logs", icon: ScrollText },
            ].map((tab) => (
              <Tabs.Trigger
                key={tab.value}
                value={tab.value}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted-foreground border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground transition-colors hover:text-foreground"
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <div className="mt-6">
            <Tabs.Content value="report">
              <ReportTab
                reportMarkdown={reportArtifact?.content ?? null}
                resultJson={resultArtifact?.content ?? null}
              />
            </Tabs.Content>

            <Tabs.Content value="data">
              <DataTab artifacts={run.artifacts} />
            </Tabs.Content>

            <Tabs.Content value="logs">
              <LogsTab events={run.events} />
            </Tabs.Content>
          </div>
        </Tabs.Root>
      </div>
    </ErrorBoundary>
  );
}
