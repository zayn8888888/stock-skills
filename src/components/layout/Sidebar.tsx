"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  Database,
  FileText,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionEntry {
  id: string;
  title: string;
  status: "running" | "completed" | "failed" | "due_review";
}

interface OverviewStats {
  running: number;
  failed: number;
  dueReview: number;
}

// ---------------------------------------------------------------------------
// Navigation items
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
  { href: "/", label: "Research Desk", icon: FileText },
  { href: "/data-sources", label: "Data Sources", icon: Database },
  { href: "/reviews", label: "Reviews", icon: BarChart3 },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [overview, setOverview] = useState<OverviewStats>({
    running: 0,
    failed: 0,
    dueReview: 0,
  });

  // Fetch sessions
  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: SessionEntry[]) => {
        setSessions(data);
        setOverview({
          running: data.filter((s) => s.status === "running").length,
          failed: data.filter((s) => s.status === "failed").length,
          dueReview: data.filter((s) => s.status === "due_review").length,
        });
      })
      .catch(() => {});
  }, []);

  const statusDot = useCallback((status: SessionEntry["status"]) => {
    const colors: Record<string, string> = {
      running: "bg-green-500",
      completed: "bg-blue-500",
      failed: "bg-destructive",
      due_review: "bg-warning",
    };
    return (
      <span
        className={cn("inline-block h-2 w-2 rounded-full shrink-0", colors[status])}
      />
    );
  }, []);

  return (
    <aside
      className={cn(
        "flex flex-col h-screen border-r border-sidebar-border bg-sidebar-background text-sidebar-foreground transition-[width] duration-200 overflow-hidden",
        collapsed ? "w-12" : "w-60"
      )}
    >
      {/* Brand header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-sidebar-border">
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight truncate">
            Stock Skills
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 px-2 py-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-primary font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Overview section */}
      {!collapsed && (
        <div className="px-3 py-2 border-t border-sidebar-border">
          <p className="text-xs font-medium text-sidebar-foreground/50 mb-1">
            Overview
          </p>
          <div className="flex gap-3 text-xs text-sidebar-foreground/70">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {overview.running} running
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
              {overview.failed} failed
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              {overview.dueReview} due
            </span>
          </div>
        </div>
      )}

      {/* Sessions list */}
      {!collapsed && sessions.length > 0 && (
        <div className="flex-1 overflow-y-auto px-2 py-2 border-t border-sidebar-border">
          <p className="px-2 text-xs font-medium text-sidebar-foreground/50 mb-1">
            Sessions
          </p>
          <div className="flex flex-col gap-0.5">
            {sessions.map((session) => (
              <button
                key={session.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground text-left truncate"
              >
                {statusDot(session.status)}
                <span className="truncate">{session.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom controls */}
      <div className="flex flex-col gap-1 px-2 py-2 border-t border-sidebar-border">
        {/* Language switcher placeholder */}
        <button
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          title={collapsed ? "Language" : undefined}
        >
          <Globe className="h-4 w-4 shrink-0" />
          {!collapsed && <span>English</span>}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          title={collapsed ? "Toggle theme" : undefined}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 shrink-0" />
          ) : (
            <Moon className="h-4 w-4 shrink-0" />
          )}
          {!collapsed && (
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          )}
        </button>
      </div>
    </aside>
  );
}
