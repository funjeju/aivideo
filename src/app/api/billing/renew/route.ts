import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getTier, type TierId } from "@/lib/pricing";
import { chargeWithBillingKey, portoneConfigured } from "@/lib/portone";
import { activateSubscription, subscriptionPaymentId, type Subscription } from "@/lib/credits";

export const maxDuration = 60;

/**
 * 구독 자동 갱신 cron. 매일 1회 호출(Vercel Cron 또는 Cloud Scheduler).
 * - status=active & billingKey 존재 & currentPeriodEnd <= now+grace 인 구독을 청구.
 * - 성공: 다음 주기 활성화 + 포함 크레딧 충전. 실패: past_due 표시(다음날 재시도).
 * 인증: 헤더 x-cron-secret == INTERNAL_API_SECRET.
 *
 * 필요 색인(Firestore): subscription.status ASC + subscription.currentPeriodEnd ASC.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!portoneConfigured()) {
    return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
  }

  const now = Date.now();
  const grace = 24 * 60 * 60 * 1000; // 만료 하루 전부터 시도
  const cutoff = now + grace;

  const snap = await adminDb()
    .collection("users")
    .where("subscription.status", "==", "active")
    .where("subscription.currentPeriodEnd", "<=", cutoff)
    .limit(200)
    .get();

  const results: { uid: string; ok: boolean }[] = [];
  for (const doc of snap.docs) {
    const sub = doc.data().subscription as Subscription | undefined;
    if (!sub?.billingKey || sub.tier === "free") continue;
    const spec = getTier(sub.tier as TierId);
    const d = new Date();
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (sub.lastGrantedPeriod === period) continue; // 이미 이번 달 충전됨

    const paymentId = subscriptionPaymentId(doc.id, period);
    const charge = await chargeWithBillingKey({
      paymentId,
      billingKey: sub.billingKey,
      orderName: `Easyshorts ${spec.name} 구독 갱신 (${period})`,
      amount: spec.priceKrw,
      customerId: doc.id,
    });

    if (charge.ok) {
      const periodEnd = now + 31 * 24 * 60 * 60 * 1000;
      await activateSubscription(doc.id, spec.id, periodEnd, period, { billingKey: sub.billingKey, note: "구독 갱신" });
      await adminDb().collection("payments").doc(paymentId).set(
        { uid: doc.id, tier: spec.id, amount: spec.priceKrw, period, status: "paid", createdAt: new Date().toISOString() },
        { merge: true },
      );
      results.push({ uid: doc.id, ok: true });
    } else {
      // 결제 실패 → past_due. 며칠 실패 지속 시 별도 정책으로 해지(추후).
      await adminDb().collection("users").doc(doc.id).update({ "subscription.status": "past_due" });
      results.push({ uid: doc.id, ok: false });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
