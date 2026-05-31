"use client";

import { DataTable } from "@/components/common/DataTable";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Skeleton } from "@/components/common/Skeleton";
import { useLanguage } from "@/hooks/useLanguage";
import { authFetch } from "@/lib/api/auth-fetch";
import { cn } from "@/lib/utils";
import * as Tabs from "@radix-ui/react-tabs";
import type { ColumnDef } from "@tanstack/react-table";
import { BarChart3, Calendar, CheckCircle2, Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface Decision {
  id: string;
  session_id: string;
  observation_id: string | null;
  decision: string;
  rationale: string | null;
  confidence: number | null;
  created_at: string;
}

const LABELS = {
  en: {
    title: "Reviews",
    due: "Due",
    upcoming: "Upcoming",
    reviewed: "Reviewed",
    decision: "Decision",
    confidence: "Confidence",
    created: "Created",
    na: "N/A",
    detail: "Decision Detail",
    rationale: "Rationale",
    session: "Session",
    lesson: "Lesson",
    lessonPlaceholder: "Record a lesson learned from this decision...",
    saveLesson: "Save Lesson",
    selectDecision: "Select a decision to view details",
    noUpcoming: "No upcoming reviews",
    noReviewed: "No reviewed decisions yet",
    noData: "No data",
    previous: "Previous",
    next: "Next",
    rowsTotal: (count: number) => `${count} row(s) total`,
    page: (current: number, total: number) => `Page ${current} of ${total}`,
  },
  zh: {
    title: "复盘",
    due: "待复盘",
    upcoming: "即将到期",
    reviewed: "已复盘",
    decision: "决策",
    confidence: "置信度",
    created: "创建时间",
    na: "无",
    detail: "决策详情",
    rationale: "理由",
    session: "会话",
    lesson: "经验",
    lessonPlaceholder: "记录这次决策带来的经验...",
    saveLesson: "保存经验",
    selectDecision: "选择一条决策查看详情",
    noUpcoming: "暂无即将到期的复盘",
    noReviewed: "暂无已复盘决策",
    noData: "暂无数据",
    previous: "上一页",
    next: "下一页",
    rowsTotal: (count: number) => `共 ${count} 行`,
    page: (current: number, total: number) => `第 ${current} / ${total} 页`,
  },
} as const;

export default function ReviewsPage() {
  const { language } = useLanguage();
  const labels = LABELS[language];
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
    { value: "due", label: labels.due, count: due.length, icon: Clock },
    { value: "upcoming", label: labels.upcoming, count: upcoming.length, icon: Calendar },
    { value: "reviewed", label: labels.reviewed, count: reviewed.length, icon: CheckCircle2 },
  ];

  const columns: ColumnDef<Decision>[] = useMemo(
    () => [
      {
        accessorKey: "decision",
        header: labels.decision,
        cell: ({ row }) => (
          <span
            className={cn(
              "text-sm cursor-pointer hover:underline",
              selectedId === row.original.id
                ? "font-medium text-foreground"
                : "text-muted-foreground",
            )}
          >
            {row.original.decision}
          </span>
        ),
      },
      {
        accessorKey: "confidence",
        header: labels.confidence,
        cell: ({ row }) => {
          const c = row.original.confidence;
          if (c === null) return <span className="text-muted-foreground text-sm">{labels.na}</span>;
          return (
            <span
              className={cn(
                "text-sm font-medium",
                c >= 0.7 ? "text-green-500" : c >= 0.4 ? "text-yellow-500" : "text-red-500",
              )}
            >
              {(c * 100).toFixed(0)}%
            </span>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: labels.created,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {new Date(row.original.created_at).toLocaleDateString()}
          </span>
        ),
      },
    ],
    [labels, selectedId],
  );

  return (
    <ErrorBoundary>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold text-foreground">{labels.title}</h1>
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
                    getRowId={(decision) => decision.id}
                    selectedRowId={selectedId}
                    onRowClick={(decision) => setSelectedId(decision.id)}
                    labels={{
                      noData: labels.noData,
                      rowsTotal: labels.rowsTotal,
                      previous: labels.previous,
                      next: labels.next,
                      page: labels.page,
                    }}
                  />
                </div>

                {/* Selected detail + lesson editor */}
                <div className="lg:col-span-1">
                  {selected ? (
                    <div className="rounded-lg border border-border p-4 space-y-4 sticky top-6">
                      <h3 className="text-sm font-semibold text-foreground">{labels.detail}</h3>
                      <div className="space-y-2 text-sm">
                        <p>
                          <span className="text-muted-foreground">{labels.decision}: </span>
                          {selected.decision}
                        </p>
                        {selected.rationale && (
                          <p>
                            <span className="text-muted-foreground">{labels.rationale}: </span>
                            {selected.rationale}
                          </p>
                        )}
                        <p>
                          <span className="text-muted-foreground">{labels.session}: </span>
                          <code className="text-xs">{selected.session_id.slice(0, 8)}</code>
                        </p>
                      </div>

                      {/* Lesson editor */}
                      <div className="pt-2 border-t border-border space-y-2">
                        <label
                          htmlFor="lesson-draft"
                          className="text-sm font-medium text-foreground"
                        >
                          {labels.lesson}
                        </label>
                        <textarea
                          id="lesson-draft"
                          value={lessonDraft}
                          onChange={(e) => setLessonDraft(e.target.value)}
                          placeholder={labels.lessonPlaceholder}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none h-24 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <button
                          type="button"
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
                          {labels.saveLesson}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border p-8 text-center text-muted-foreground text-sm">
                      {labels.selectDecision}
                    </div>
                  )}
                </div>
              </Tabs.Content>

              <Tabs.Content value="upcoming" className="lg:col-span-3">
                <div className="py-12 text-center text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{labels.noUpcoming}</p>
                </div>
              </Tabs.Content>

              <Tabs.Content value="reviewed" className="lg:col-span-3">
                <div className="py-12 text-center text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{labels.noReviewed}</p>
                </div>
              </Tabs.Content>
            </div>
          </Tabs.Root>
        )}
      </div>
    </ErrorBoundary>
  );
}
