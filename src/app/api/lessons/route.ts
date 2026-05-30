import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { lessons } from "@/lib/db/schema";
import { validateAuth } from "@/lib/auth/middleware";

/** POST /api/lessons - create a new lesson */
export async function POST(req: NextRequest) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => ({}));
  const { session_id, category, summary, detail } = body as {
    session_id?: string;
    category?: string;
    summary?: string;
    detail?: string;
  };

  if (!session_id || typeof session_id !== "string") {
    return NextResponse.json(
      { error: "session_id is required" },
      { status: 400 },
    );
  }

  if (!category || typeof category !== "string") {
    return NextResponse.json(
      { error: "category is required" },
      { status: 400 },
    );
  }

  if (!summary || typeof summary !== "string") {
    return NextResponse.json(
      { error: "summary is required" },
      { status: 400 },
    );
  }

  const db = getDb();
  const now = new Date().toISOString();
  const id = nanoid();

  await db.insert(lessons).values({
    id,
    sessionId: session_id,
    category,
    summary,
    detail: detail ?? null,
    createdAt: now,
  });

  return NextResponse.json(
    {
      id,
      session_id,
      category,
      summary,
      detail: detail ?? null,
      created_at: now,
    },
    { status: 201 },
  );
}
