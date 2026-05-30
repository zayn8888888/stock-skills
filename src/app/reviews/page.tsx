"use client";

import { useEffect, useState, useMemo } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import type { ColumnDef } from "@tanstack/react-table";
import { BarChart3, Calendar, CheckCircle2, Clock } from "lucide-react";
import { DataTable } from "@/components/common/DataTable";
import { Skeleton } from "@/components/common/Skeleton";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { authFetch } from "@/lib/api/auth-fetch";
import { cn } from "@/lib/utils";

interface Decision {
  id: string;
  session_id: string;
  observation_id: string | null;
  decision: string;
  rationale: string | null;
  confidence: number | null;
  created_at: string;
}

export default function ReviewsPage() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lessonDraft, setLessonDraft] = useState("");

  useEffect(() => {
    fetch("/api/reviews/due")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Decision[]) => {
        setDecisions(data);
        if (data.length > 0) setSelectedId(data[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const selected = decisions.find((d) => d.id === selectedId) ?? null;

  // Partition into filter groups (simplified: all as "due" since no status column yet)
  const due = decisions;
  const upcoming: Decision[] = [];
  const reviewed: Decision[] = [];

  const tabs = [
    { value: "due", label: "Due", count: due.length, icon: Clock },
    { value: "upcoming", label: "Upcoming", count: upcoming.length, icon: Calendar },
    { value: "reviewed", label: "Reviewed", count: reviewed.length, icon: CheckCircle2 },
  ];

  const columns: ColumnDef<Decision>[] = useMemo(
    () => [
      {
        accessorKey: "decision",
        header: "Decision",
        cell: ({ row }) => (
          <span
            className={cn(
              "text-sm cursor-pointer hover:underline",
              selectedId === row.original.id
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            )}
          >
            {row.original.decision}
          </span>
        ),
      },
      {
        accessorKey: "confidence",
        header: "Confidence",
        cell: ({ row }) => {
          const c = row.original.confidence;
          if (c === null) return <span className="text-muted-foreground text-sm">N/A</span>;
          return (
            <span
              className={cn(
                "text-sm font-medium",
                c >= 0.7
                  ? "text-green-500"
                  : c >= 0.4
                    ? "text-yellow-500"
                    : "text-red-500"
              )}
            >
              {(c * 100).toFixed(0)}%
            </span>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.created_at).toLocaleDateString()}
          </span>
        ),
      },
    ],
    [selectedId]
  );

  return (
    <ErrorBoundary>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold text-foreground">Reviews</h1>
        </div>

        {loading ? (
          <Skeleton variant="card" className="h-64" />
        ) : (
          <Tabs.Root defaultValue="due" className="w-full">
            <Tabs.List className="flex gap-1 border-b border-border">
              {tabs.map((tab) => (
                <Tabs.Trigger
                  key={tab.value}
                  value={tab.value}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted-foreground border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-foreground transition-colors hover:text-foreground"
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                  <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                    {tab.count}
                  </span>
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Tabs.Content value="due" className="lg:col-span-3 contents">
                {/* Decision table */}
                <div className="lg:col-span-2">
                  <DataTable
                    columns={columns}
                    data={due}
                    pageSize={10}
                  />
                </div>

                {/* Selected detail + lesson editor */}
                <div className="lg:col-span-1">
                  {selected ? (
                    <div className="rounded-lg border border-border p-4 space-y-4 sticky top-6">
                      <h3 className="text-sm font-semibold text-foreground">
                        Decision Detail
                      </h3>
                      <div className="space-y-2 text-sm">
                        <p>
                          <span className="text-muted-foreground">Decision: </span>
                          {selected.decision}
                        </p>
                        {selected.rationale && (
                          <p>
                            <span className="text-muted-foreground">Rationale: </span>
                            {selected.rationale}
                          </p>
                        )}
                        <p>
                          <span className="text-muted-foreground">Session: </span>
                          <code className="text-xs">{selected.session_id.slice(0, 8)}</code>
                        </p>
                      </div>

                      {/* Lesson editor */}
                      <div className="pt-2 border-t border-border space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          Lesson
                        </label>
                        <textarea
                          value={lessonDraft}
                          onChange={(e) => setLessonDraft(e.target.value)}
                          placeholder="Record a lesson learned from this decision..."
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none h-24 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <button
                          onClick={() => {
                            if (!lessonDraft.trim()) return;
                            authFetch("/api/lessons", {
                              method: "POST",
                              body: JSON.stringify({
                                session_id: selected.session_id,
                                category: "strategy",
                                summary: lessonDraft.trim(),
                              }),
                            });
                            setLessonDraft("");
                          }}
                          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                          Save Lesson
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border p-8 text-center text-muted-foreground text-sm">
                      Select a decision to view details
                    </div>
                  )}
                </div>
              </Tabs.Content>

              <Tabs.Content value="upcoming" className="lg:col-span-3">
                <div className="py-12 text-center text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No upcoming reviews</p>
                </div>
              </Tabs.Content>

              <Tabs.Content value="reviewed" className="lg:col-span-3">
                <div className="py-12 text-center text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No reviewed decisions yet</p>
                </div>
              </Tabs.Content>
            </div>
          </Tabs.Root>
        )}
      </div>
    </ErrorBoundary>
  );
}
