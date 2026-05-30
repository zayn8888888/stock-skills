import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dataSources } from "@/lib/db/schema";

/** GET /api/data-sources/health - list all data sources with health status */
export async function GET(_req: NextRequest) {
  const db = getDb();

  const rows = await db
    .select()
    .from(dataSources)
    .orderBy(desc(dataSources.updatedAt));

  const items = rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    last_sync_at: row.lastSyncAt,
    connection_info: row.connectionInfo ? JSON.parse(row.connectionInfo) : null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }));

  return NextResponse.json(items);
}
