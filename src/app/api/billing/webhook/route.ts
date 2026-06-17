import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { verifyWebhook } from "@/lib/portone";

export const maxDuration = 30;

/**
 * 포트원 V2 웹훅 수신. 결제 성공/실패를 비동기로 통지받아 결제 기록을 보정한다.
 * 실제 크레딧 충전/구독 활성화는 subscribe·renew 경로가 동기로 처리하므로,
 * 여기서는 멱등하게 payments 문서 상태만 갱신(누락/지연 보정용 안전망).
 *
 * paymentId 규칙: `sub_{uid}_{period}` → uid/period 역추출 가능.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const ok = verifyWebhook(rawBody, {
    id: req.headers.get("webhook-id"),
    timestamp: req.headers.get("webhook-timestamp"),
    signature: req.headers.get("webhook-signature"),
  });
  if (!ok) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  try {
    const evt = JSON.parse(rawBody) as { type?: string; data?: { paymentId?: string; status?: string } };
    const paymentId = evt.data?.paymentId;
    if (paymentId && paymentId.startsWith("sub_")) {
      const status =
        evt.type?.includes("Paid") || evt.data?.status === "PAID" ? "paid" :
        evt.type?.includes("Failed") || evt.data?.status === "FAILED" ? "failed" :
        evt.type?.includes("Cancelled") ? "cancelled" : null;
      if (status) {
        await adminDb().collection("payments").doc(paymentId).set(
          { status, webhookType: evt.type ?? null, webhookAt: new Date().toISOString() },
          { merge: true },
        );
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("webhook handling failed:", e);
    // 서명은 통과했으니 200 반환(재시도 폭주 방지) — 내부 처리 실패만 로깅
    return NextResponse.json({ ok: true });
  }
}
