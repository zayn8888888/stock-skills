import { getConfig } from "@/lib/config";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { token: getConfig().token },
    { headers: { "Cache-Control": "no-store" } },
  );
}
