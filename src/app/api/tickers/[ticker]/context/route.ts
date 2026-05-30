import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildTickerContext } from "@/lib/views/ticker-context";

/** GET /api/tickers/[ticker]/context - return unified TickerContext */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;

  if (!ticker || typeof ticker !== "string") {
    return NextResponse.json(
      { error: "ticker is required" },
      { status: 400 },
    );
  }

  const db = getDb();
  const context = buildTickerContext(db, ticker.toUpperCase());

  return NextResponse.json(context);
}
