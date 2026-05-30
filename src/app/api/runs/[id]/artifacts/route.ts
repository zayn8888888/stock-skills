import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { runs, artifacts } from "@/lib/db/schema";
import { validateAuth } from "@/lib/auth/middleware";
import { writeArtifact } from "@/lib/runtime/artifact-writer";
import { eq } from "drizzle-orm";

type RouteCtx = { params: Promise<{ id: string }> };

/** Valid artifact types (maps to the `kind` column). */
const VALID_ARTIFACT_TYPES = new Set(["report", "chart", "data", "model"]);

/** POST /api/runs/[id]/artifacts - submit an artifact for a run */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id: runId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const {
    artifact_type,
    schema_version,
    content_type,
    producer,
    body: artifactBody,
  } = body as {
    artifact_type?: string;
    schema_version?: string;
    content_type?: string;
    producer?: string;
    body?: string;
  };

  if (!artifact_type || typeof artifact_type !== "string") {
    return NextResponse.json(
      { error: "artifact_type is required" },
      { status: 400 },
    );
  }

  if (!VALID_ARTIFACT_TYPES.has(artifact_type)) {
    return NextResponse.json(
      {
        error: `Invalid artifact_type "${artifact_type}". Must be one of: ${[...VALID_ARTIFACT_TYPES].join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (!producer || typeof producer !== "string") {
    return NextResponse.json(
      { error: "producer is required" },
      { status: 400 },
    );
  }

  const db = getDb();

  // Verify run exists
  const [run] = await db
    .select()
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const artifactId = nanoid();

  // Derive a filename from the artifact type and id
  const ext =
    artifact_type === "report"
      ? ".md"
      : artifact_type === "chart"
        ? ".svg"
        : artifact_type === "data"
          ? ".json"
          : ".json";
  const filename = `${artifact_type}-${artifactId}${ext}`;

  let filePath: string | null = null;

  // Write artifact to disk if body content is provided
  if (artifactBody && typeof artifactBody === "string") {
    try {
      const result = writeArtifact(runId, filename, artifactBody);
      filePath = result.path;
    } catch (err) {
      return NextResponse.json(
        {
          error: `Failed to write artifact: ${err instanceof Error ? err.message : String(err)}`,
        },
        { status: 500 },
      );
    }
  }

  await db.insert(artifacts).values({
    id: artifactId,
    runId,
    kind: artifact_type,
    name: filename,
    path: filePath,
    content: artifactBody ?? null,
    mimeType: content_type ?? null,
    createdAt: now,
  });

  return NextResponse.json(
    {
      artifact_id: artifactId,
      run_id: runId,
      kind: artifact_type,
      name: filename,
      path: filePath,
      content: artifactBody ?? null,
      mime_type: content_type ?? null,
      schema_version: schema_version ?? null,
      producer,
      created_at: now,
    },
    { status: 201 },
  );
}

/** GET /api/runs/[id]/artifacts - list artifacts for a run */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id: runId } = await ctx.params;
  const db = getDb();

  // Verify run exists
  const [run] = await db
    .select()
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.runId, runId));

  const items = rows.map((a) => ({
    artifact_id: a.id,
    run_id: a.runId,
    kind: a.kind,
    name: a.name,
    path: a.path,
    content: a.content,
    mime_type: a.mimeType,
    created_at: a.createdAt,
  }));

  return NextResponse.json(items);
}
