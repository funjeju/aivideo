import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuthedUser, isAdmin, isSuperAdmin } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";

const ref = () => adminDb().collection("settings").doc("global");

export async function GET(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const d = (await ref().get()).data() ?? {};
  return NextResponse.json({
    billingEnabled: d.billingEnabled === true,
    brushSize: d.brushSize ?? 1,
  });
}

export async function POST(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isSuperAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (typeof body.billingEnabled === "boolean") patch.billingEnabled = body.billingEnabled;
  if (typeof body.brushSize === "number") patch.brushSize = Math.min(3, Math.max(0.3, body.brushSize));
  await ref().set(patch, { merge: true });
  return NextResponse.json({ ok: true });
}
