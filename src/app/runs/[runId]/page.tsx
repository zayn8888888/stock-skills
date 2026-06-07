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
  runId: string;
  sessionId: string;
  skillName: string;
  status: string;
  workflowType: string | null;
  ticker: string | null;
  market: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  artifacts: {
    id: string;
    runId: string;
    kind: string;
    name: string;
    path: string | null;
    content: string | null;
    mimeType: string | null;
    contentType: string | null;
    createdAt: string;
  }[];
  events: {
    id: string;
    type: string;
    createdAt: string;
    payloadJson: string | null;
  }[];
}

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  succeeded: { icon: CheckCircle2, color: "text-green-500", label: "Succeeded" },
  failed: { icon: XCircle, color: "text-destructive", label: "Failed" },
  running: { icon: Loader2, color: "text-blue-500", label: "Running" },
  queued: { icon: Clock, color: "text-muted-foreground", label: "Queued" },
  waiting_for_input: { icon: Clock, color: "text-muted-foreground", label: "Waiting" },
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
    fetch(`/api/runs/${runId}/timeline`)
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

  const st = statusConfig[run.status] ?? statusConfig.queued;
  const StatusIcon = st.icon;

  const artifacts = run.artifacts.map((artifact) => ({
    artifact_id: artifact.id,
    kind: artifact.kind,
    name: artifact.name,
    path: artifact.path,
    content: artifact.content,
    mime_type: artifact.mimeType ?? artifact.contentType,
    created_at: artifact.createdAt,
  }));
  const events = run.events.map((event) => ({
    event_id: event.id,
    event_type: event.type,
    timestamp: event.createdAt,
    data: parsePayload(event.payloadJson),
  }));

  const reportArtifact = artifacts.find((a) => a.name === "report.md" || a.kind === "report");
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
            {run.skillName}
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
            { label: "Run ID", value: run.runId.slice(0, 8) },
            { label: "Skill", value: run.skillName },
            { label: "Ticker", value: run.ticker ?? "N/A" },
            { label: "Duration", value: formatDuration(run.durationMs) },
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
              <DataTab artifacts={artifacts} />
            </Tabs.Content>

            <Tabs.Content value="logs">
              <LogsTab events={events} />
            </Tabs.Content>
          </div>
        </Tabs.Root>
      </div>
    </ErrorBoundary>
  );
}

function parsePayload(payloadJson: string | null): Record<string, unknown> | null {
  if (!payloadJson) return null;
  try {
    return JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return { raw: payloadJson };
  }
}
