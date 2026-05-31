import type { SourceHealth } from "@/lib/adapters/base";
import { getRouter, registry } from "@/lib/adapters/init";
import { validateAuth } from "@/lib/auth/middleware";
import { type NextRequest, NextResponse } from "next/server";

/** POST /api/data-sources/check - trigger health check on all adapters */
export async function POST(req: NextRequest) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  getRouter(); // ensure initialized

  let results: SourceHealth[];
  try {
    results = await registry.healthCheckAll();
  } catch (err) {
    return NextResponse.json(
      { error: "Health check failed", detail: String(err) },
      { status: 500 },
    );
  }

  return NextResponse.json(results);
}
