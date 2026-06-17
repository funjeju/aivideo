import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * 사전예약(대기 큐) — 결제 시스템 도입 전, 출시 전 신청 시 30% 할인 약속.
 * 이메일 + 희망 티어를 받아 waitlist 컬렉션에 저장(이메일+티어로 dedupe). 결제 없음.
 */
const VALID_TIERS = ["tier1", "tier2", "tier3"];

export async function POST(req: NextRequest) {
  try {
    const { email, tier, uid } = await req.json();
    const e = String(email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      return NextResponse.json({ error: "유효한 이메일을 입력해 주세요" }, { status: 400 });
    }
    if (!VALID_TIERS.includes(tier)) {
      return NextResponse.json({ error: "invalid tier" }, { status: 400 });
    }
    // 이메일+티어로 문서 id 고정 → 중복 신청 방지(덮어쓰기)
    const id = `${tier}__${e.replace(/[^a-z0-9]/g, "_")}`;
    await adminDb().collection("waitlist").doc(id).set(
      {
        email: e,
        tier,
        uid: typeof uid === "string" ? uid : null,
        discount: 0.3,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("waitlist failed:", e);
    return NextResponse.json({ error: "신청 처리 실패" }, { status: 500 });
  }
}
