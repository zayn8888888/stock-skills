import { existsSync, readFileSync } from "node:fs";
import { validateAuth } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db";
import { artifacts, runs } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

type RouteCtx = { params: Promise<{ id: string }> };

/** GET /api/runs/[id]/report - return report.md content as text/markdown */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id: runId } = await ctx.params;
  const db = getDb();

  // Verify run exists
  const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Look for a report-type artifact
  const [reportArtifact] = await db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.runId, runId), eq(artifacts.kind, "report")))
    .limit(1);

  if (!reportArtifact) {
    return NextResponse.json({ error: "No report artifact found for this run" }, { status: 404 });
  }

  // Try to read from disk first, fall back to stored content
  let content: string;

  if (reportArtifact.path && existsSync(reportArtifact.path)) {
    content = readFileSync(reportArtifact.path, "utf-8");
  } else if (reportArtifact.content) {
    content = reportArtifact.content;
  } else {
    return NextResponse.json({ error: "Report artifact has no content" }, { status: 404 });
  }

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
