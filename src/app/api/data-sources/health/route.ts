import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { listProviders } from "@/lib/data-source/service";
import { getRouter } from "@/lib/adapters/init";

/** GET /api/data-sources/health - list all providers with health status */
export async function GET(_req: NextRequest) {
  const db = getDb();
  getRouter(); // ensure initialized

  const providers = listProviders(db);

  const items = providers.map((p) => ({
    id: p.id,
    name: p.name,
    adapter_id: p.adapterId,
    enabled: p.enabled === 1,
    status: p.status,
    last_check_at: p.lastCheckAt,
    last_error: p.lastError,
    connection_config: p.connectionConfig ? JSON.parse(p.connectionConfig) : null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  }));

  return NextResponse.json(items);
}
