import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuthedUser, isAdmin, isSuperAdmin } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";

const ref = () => adminDb().collection("settings").doc("global");

export async function GET(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const snap = await ref().get();
  return NextResponse.json({ billingEnabled: snap.exists ? snap.data()?.billingEnabled === true : false });
}

export async function POST(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isSuperAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { billingEnabled } = await req.json();
  await ref().set(
    { billingEnabled: !!billingEnabled, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return NextResponse.json({ ok: true, billingEnabled: !!billingEnabled });
}
