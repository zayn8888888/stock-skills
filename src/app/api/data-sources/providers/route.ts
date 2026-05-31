import { getRouter, reloadRouter } from "@/lib/adapters/init";
import { validateAuth } from "@/lib/auth/middleware";
import { createProvider, listProviders } from "@/lib/data-source/service";
import { getDb } from "@/lib/db";
import { type NextRequest, NextResponse } from "next/server";

/** GET /api/data-sources/providers */
export async function GET(_req: NextRequest) {
  getRouter(); // ensure initialized
  const db = getDb();
  return NextResponse.json(listProviders(db));
}

/** POST /api/data-sources/providers */
export async function POST(req: NextRequest) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  getRouter();
  const db = getDb();
  const body = await req.json();

  if (!body.name || !body.adapterId) {
    return NextResponse.json({ error: "name and adapterId required" }, { status: 400 });
  }

  try {
    const provider = createProvider(db, {
      name: body.name,
      adapterId: body.adapterId,
      connectionConfig: body.connectionConfig ? JSON.stringify(body.connectionConfig) : undefined,
    });
    reloadRouter();
    return NextResponse.json(provider, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
