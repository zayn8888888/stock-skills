"use client";

import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Skeleton } from "@/components/common/Skeleton";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Activity,
  ArrowLeft,
  Eye,
  FileCheck,
  GraduationCap,
  History,
  LineChart,
  PlayCircle,
  Scale,
  Swords,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface TickerData {
  ticker: string;
  market: string;
  sessionCount: number;
  runCount: number;
}

export default function TickerPage() {
  const params = useParams();
  const ticker = params.ticker as string;

  const [data, setData] = useState<TickerData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;
    // Minimal fetch - assemble from sessions/runs API if available
    setLoading(true);
    fetch(`/api/sessions?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((sessions) => {
        setData({
          ticker: ticker.toUpperCase(),
          market: "US",
          sessionCount: sessions.length,
          runCount: sessions.reduce(
            (s: number, sess: { run_count?: number }) => s + (sess.run_count ?? 0),
            0,
          ),
        });
        setLoading(false);
      })
      .catch(() => {
        setData({
          ticker: ticker.toUpperCase(),
          market: "US",
          sessionCount: 0,
          runCount: 0,
        });
        setLoading(false);
      });
  }, [ticker]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton variant="heading" className="w-48" />
        <Skeleton variant="card" />
      </div>
    );
  }

  const tickerData = data ?? {
    ticker: ticker.toUpperCase(),
    market: "US",
    sessionCount: 0,
    runCount: 0,
  };

  const actions = [
    {
      label: "Analyze",
      icon: Activity,
      color: "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20",
    },
    {
      label: "Debate",
      icon: Swords,
      color: "bg-purple-500/10 text-purple-500 hover:bg-purple-500/20",
    },
    {
      label: "Review",
      icon: FileCheck,
      color: "bg-green-500/10 text-green-500 hover:bg-green-500/20",
    },
  ];

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
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">{tickerData.ticker}</h1>
            <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {tickerData.market}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {tickerData.sessionCount} session(s) / {tickerData.runCount} run(s)
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          {actions.map((action) => (
            <button
              type="button"
              key={action.label}
              className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${action.color}`}
            >
              <action.icon className="h-4 w-4" />
              {action.label}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <Tabs.Root defaultValue="context" className="w-full">
          <Tabs.List className="flex gap-1 border-b border-border">
            {[
              { value: "context", label: "Context", icon: LineChart },
              { value: "runs", label: "Runs", icon: PlayCircle },
              { value: "decisions", label: "Decisions", icon: Scale },
              { value: "lessons", label: "Lessons", icon: GraduationCap },
              { value: "observations", label: "Observations", icon: Eye },
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
            <Tabs.Content value="context">
              <div className="py-12 text-center text-muted-foreground">
                <LineChart className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">
                  Ticker context view - market data, observations, and timeline
                </p>
              </div>
            </Tabs.Content>

            <Tabs.Content value="runs">
              <div className="py-12 text-center text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Run history for {tickerData.ticker}</p>
              </div>
            </Tabs.Content>

            <Tabs.Content value="decisions">
              <div className="py-12 text-center text-muted-foreground">
                <Scale className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Decision log for {tickerData.ticker}</p>
              </div>
            </Tabs.Content>

            <Tabs.Content value="lessons">
              <div className="py-12 text-center text-muted-foreground">
                <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Lessons learned for {tickerData.ticker}</p>
              </div>
            </Tabs.Content>

            <Tabs.Content value="observations">
              <div className="py-12 text-center text-muted-foreground">
                <Eye className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Observations for {tickerData.ticker}</p>
              </div>
            </Tabs.Content>
          </div>
        </Tabs.Root>
      </div>
    </ErrorBoundary>
  );
}
