import { getRouter, reloadRouter } from "@/lib/adapters/init";
import { validateAuth } from "@/lib/auth/middleware";
import { createRoute, listRoutes } from "@/lib/data-source/service";
import { getDb } from "@/lib/db";
import { type NextRequest, NextResponse } from "next/server";

/** GET /api/data-sources/routes */
export async function GET(req: NextRequest) {
  getRouter();
  const db = getDb();
  const providerId = req.nextUrl.searchParams.get("providerId") ?? undefined;
  const capabilityId = req.nextUrl.searchParams.get("capabilityId") ?? undefined;
  return NextResponse.json(listRoutes(db, { providerId, capabilityId }));
}

/** POST /api/data-sources/routes */
export async function POST(req: NextRequest) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  getRouter();
  const db = getDb();
  const body = await req.json();

  if (!body.providerId || !body.capabilityId) {
    return NextResponse.json({ error: "providerId and capabilityId required" }, { status: 400 });
  }

  try {
    const route = createRoute(db, {
      providerId: body.providerId,
      capabilityId: body.capabilityId,
      markets: body.markets,
      priority: body.priority,
    });
    reloadRouter();
    return NextResponse.json(route, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
