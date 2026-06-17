import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuthedUser } from "@/lib/auth";
import { cancelSubscription, type Subscription } from "@/lib/credits";
import { deleteBillingKey } from "@/lib/portone";

/**
 * 본인 구독 해지. 현재 주기(currentPeriodEnd)까지는 유효, 다음 갱신 없음.
 * 등록된 빌링키도 폐기(자동청구 방지).
 */
export async function POST(req: NextRequest) {
  try {
    const me = await getAuthedUser(req);
    if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const snap = await adminDb().collection("users").doc(me.uid).get();
    const sub = snap.data()?.subscription as Subscription | undefined;
    if (!sub || sub.status === "canceled") {
      return NextResponse.json({ ok: true, alreadyCanceled: true });
    }

    await cancelSubscription(me.uid);
    if (sub.billingKey) {
      await deleteBillingKey(sub.billingKey).catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("cancel failed:", e);
    return NextResponse.json({ error: "cancel failed" }, { status: 500 });
  }
}
