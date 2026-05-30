"use client";

import { FileText } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border px-6 py-4">
        <FileText className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Research Desk</h1>
      </header>

      {/* Content area */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <FileText className="mx-auto h-12 w-12 mb-4 opacity-30" />
          <p className="text-sm">
            Select a session from the sidebar or start a new research query.
          </p>
        </div>
      </div>
    </div>
  );
}
