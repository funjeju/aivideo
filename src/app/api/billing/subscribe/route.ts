import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuthedUser } from "@/lib/auth";
import { getTier, type TierId } from "@/lib/pricing";
import { chargeWithBillingKey, portoneConfigured } from "@/lib/portone";
import { activateSubscription } from "@/lib/credits";

export const maxDuration = 30;

/**
 * 구독 신청. 클라가 포트원 SDK로 빌링키(카드등록)를 발급받아 전달 → 서버가 첫 달 결제 →
 * 성공 시 구독 활성화 + 포함 크레딧 충전 + 빌링키 저장(다음 달 자동청구용).
 * body: { billingKey: string, tier: "tier1"|"tier2"|"tier3" }
 */
export async function POST(req: NextRequest) {
  try {
    if (!portoneConfigured()) {
      return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
    }
    const me = await getAuthedUser(req);
    if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { billingKey, tier } = await req.json();
    const spec = getTier(tier as TierId);
    if (!billingKey || spec.id === "free") {
      return NextResponse.json({ error: "billingKey, valid tier required" }, { status: 400 });
    }

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const paymentId = `sub_${me.uid}_${period}`; // 멱등 — 같은 달 중복청구 방지

    const charge = await chargeWithBillingKey({
      paymentId,
      billingKey,
      orderName: `Easyshorts ${spec.name} 구독 (${period})`,
      amount: spec.priceKrw,
      customerId: me.uid,
    });
    if (!charge.ok) {
      return NextResponse.json({ error: "payment_failed", detail: charge.error }, { status: 402 });
    }

    const periodEnd = now.getTime() + 31 * 24 * 60 * 60 * 1000;
    const res = await activateSubscription(me.uid, spec.id, periodEnd, period, {
      billingKey, note: "구독 결제",
    });

    // 결제 기록(정산·환불 추적)
    await adminDb().collection("payments").doc(paymentId).set({
      uid: me.uid, tier: spec.id, amount: spec.priceKrw, period,
      status: "paid", createdAt: now.toISOString(),
    }, { merge: true });

    return NextResponse.json({ ok: true, granted: res.granted });
  } catch (e) {
    console.error("subscribe failed:", e);
    return NextResponse.json({ error: "subscribe failed" }, { status: 500 });
  }
}
