import { getRouter, reloadRouter } from "@/lib/adapters/init";
import { validateAuth } from "@/lib/auth/middleware";
import { createCapability, listCapabilities } from "@/lib/data-source/service";
import { getDb } from "@/lib/db";
import { type NextRequest, NextResponse } from "next/server";

/** GET /api/data-sources/capabilities */
export async function GET(_req: NextRequest) {
  getRouter();
  const db = getDb();
  return NextResponse.json(listCapabilities(db));
}

/** POST /api/data-sources/capabilities */
export async function POST(req: NextRequest) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  getRouter();
  const db = getDb();
  const body = await req.json();

  if (!body.slug || !body.category || !body.displayName) {
    return NextResponse.json({ error: "slug, category, displayName required" }, { status: 400 });
  }

  try {
    const cap = createCapability(db, body);
    reloadRouter();
    return NextResponse.json(cap, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
