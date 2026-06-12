import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import { getAuthedUser, isSuperAdmin } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isSuperAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const { action, userId } = body;
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const db = adminDb();
  const ref = db.collection("users").doc(userId);

  try {
    if (action === "adjustCredits") {
      const delta = Number(body.delta);
      if (isNaN(delta)) return NextResponse.json({ error: "invalid delta" }, { status: 400 });
      await ref.update({ credits: FieldValue.increment(delta), updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true });
    }

    if (action === "setRole") {
      const role = body.role;
      if (!["user", "staff", "superadmin"].includes(role)) {
        return NextResponse.json({ error: "invalid role" }, { status: 400 });
      }
      // 본인 강등 방지 (마지막 superadmin 보호 차원의 최소 안전장치)
      if (userId === me.uid && role !== "superadmin") {
        return NextResponse.json({ error: "본인 권한은 낮출 수 없습니다" }, { status: 400 });
      }
      await ref.update({ role, updatedAt: FieldValue.serverTimestamp() });
      // Custom Claims도 동기화 (서버 API 인증용)
      await adminAuth().setCustomUserClaims(userId, { role });
      return NextResponse.json({ ok: true });
    }

    if (action === "setBillingExempt") {
      await ref.update({ billingExempt: !!body.exempt, updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    console.error("admin members action failed:", e);
    return NextResponse.json({ error: "action failed" }, { status: 500 });
  }
}
