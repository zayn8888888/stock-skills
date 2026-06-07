"use client";

import { useTheme } from "@/hooks/useTheme";
import { useCallback, useEffect, useState } from "react";
import { ConnectionBanner } from "./ConnectionBanner";
import { Sidebar } from "./Sidebar";

const SIDEBAR_STORAGE_KEY = "sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  // Initialize theme on mount
  useTheme();

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    setCollapsed(window.innerWidth < 768 || stored === "true");
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      <main className="flex flex-1 flex-col overflow-hidden">
        <ConnectionBanner />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
