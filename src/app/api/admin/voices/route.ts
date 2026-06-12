import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuthedUser, isAdmin } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { action, voiceId, tier } = await req.json();
  if (!voiceId) return NextResponse.json({ error: "voiceId required" }, { status: 400 });
  const ref = adminDb().collection("voices").doc(voiceId);

  if (action === "toggleEnabled") {
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "not found" }, { status: 404 });
    await ref.update({ enabled: !snap.data()?.enabled, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true });
  }

  if (action === "setTier") {
    if (!["free", "premium"].includes(tier)) {
      return NextResponse.json({ error: "invalid tier" }, { status: 400 });
    }
    await ref.update({ tier, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
