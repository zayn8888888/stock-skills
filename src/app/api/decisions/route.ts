import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { decisions } from "@/lib/db/schema";
import { validateAuth } from "@/lib/auth/middleware";

/** POST /api/decisions - create a new decision */
export async function POST(req: NextRequest) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const body = await req.json().catch(() => ({}));
  const {
    session_id,
    observation_id,
    decision: decisionText,
    rationale,
    confidence,
  } = body as {
    session_id?: string;
    observation_id?: string;
    decision?: string;
    rationale?: string;
    confidence?: number;
  };

  if (!session_id || typeof session_id !== "string") {
    return NextResponse.json(
      { error: "session_id is required" },
      { status: 400 },
    );
  }

  if (!decisionText || typeof decisionText !== "string") {
    return NextResponse.json(
      { error: "decision is required" },
      { status: 400 },
    );
  }

  const db = getDb();
  const now = new Date().toISOString();
  const id = nanoid();

  await db.insert(decisions).values({
    id,
    sessionId: session_id,
    observationId: observation_id ?? null,
    decision: decisionText,
    rationale: rationale ?? null,
    confidence: confidence ?? null,
    createdAt: now,
  });

  return NextResponse.json(
    {
      id,
      session_id,
      observation_id: observation_id ?? null,
      decision: decisionText,
      rationale: rationale ?? null,
      confidence: confidence ?? null,
      created_at: now,
    },
    { status: 201 },
  );
}
