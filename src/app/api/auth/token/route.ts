import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export async function GET() {
  return NextResponse.json(
    { token: getConfig().token },
    { headers: { "Cache-Control": "no-store" } },
  );
}
