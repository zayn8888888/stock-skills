import { reloadRouter } from "@/lib/adapters/init";
import { validateAuth } from "@/lib/auth/middleware";
import { deleteCapability, getCapability, updateCapability } from "@/lib/data-source/service";
import { getDb } from "@/lib/db";
import { type NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id } = await ctx.params;
  const db = getDb();
  const existing = getCapability(db, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const updated = updateCapability(db, id, body);
  reloadRouter();
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  const { id } = await ctx.params;
  const db = getDb();
  const existing = getCapability(db, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  deleteCapability(db, id);
  reloadRouter();
  return NextResponse.json({ ok: true });
}
