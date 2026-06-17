import crypto from "node:crypto";

/**
 * 포트원(PortOne) V2 서버 연동.
 * 인증: 모든 REST 호출에 헤더 `Authorization: PortOne {API_SECRET}`.
 *
 * env (Vercel):
 *  - PORTONE_API_SECRET            서버 전용 비밀키(절대 클라 노출 X)
 *  - PORTONE_WEBHOOK_SECRET        웹훅 서명 검증 시크릿(whsec_...)
 *  - NEXT_PUBLIC_PORTONE_STORE_ID  상점 ID(store-...) — 클라 SDK용
 *  - NEXT_PUBLIC_PORTONE_CHANNEL_KEY 채널키(channel-key-...) — 클라 SDK용
 */

const API_BASE = "https://api.portone.io";

export function portoneConfigured(): boolean {
  return !!process.env.PORTONE_API_SECRET;
}

function authHeaders() {
  return {
    Authorization: `PortOne ${process.env.PORTONE_API_SECRET}`,
    "Content-Type": "application/json",
  };
}

export interface BillingChargeResult {
  ok: boolean;
  status?: number;
  paymentId: string;
  raw?: unknown;
  error?: string;
}

/**
 * 빌링키로 즉시 결제(정기결제 1회분 청구).
 * @param paymentId 우리 측 고유 결제 ID(멱등키 역할 — 중복청구 방지). 예: `sub_{uid}_{period}`
 */
export async function chargeWithBillingKey(params: {
  paymentId: string;
  billingKey: string;
  orderName: string;
  amount: number;          // 원(KRW), 정수
  customerId?: string;
  customerEmail?: string;
}): Promise<BillingChargeResult> {
  const { paymentId, billingKey, orderName, amount, customerId, customerEmail } = params;
  try {
    const res = await fetch(`${API_BASE}/payments/${encodeURIComponent(paymentId)}/billing-key`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        billingKey,
        orderName,
        currency: "KRW",
        amount: { total: Math.round(amount) },
        customer: customerId || customerEmail ? { id: customerId, email: customerEmail } : undefined,
      }),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: res.status, paymentId, raw, error: (raw as { message?: string })?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, paymentId, raw };
  } catch (e) {
    return { ok: false, paymentId, error: e instanceof Error ? e.message : "charge failed" };
  }
}

/** 결제 단건 조회(웹훅 검증 후 실제 상태 확인용). */
export async function getPayment(paymentId: string): Promise<{ ok: boolean; data?: unknown }> {
  try {
    const res = await fetch(`${API_BASE}/payments/${encodeURIComponent(paymentId)}`, { headers: authHeaders() });
    if (!res.ok) return { ok: false };
    return { ok: true, data: await res.json() };
  } catch {
    return { ok: false };
  }
}

/** 빌링키 삭제(구독 해지 시 카드 정보 폐기). */
export async function deleteBillingKey(billingKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/billing-keys/${encodeURIComponent(billingKey)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 포트원 V2 웹훅 서명 검증(Standard Webhooks 규격).
 * 헤더: webhook-id / webhook-timestamp / webhook-signature(`v1,<base64sig>` 공백구분 다중).
 * 서명 = base64(HMAC-SHA256(secretBytes, `${id}.${timestamp}.${rawBody}`)).
 * @param rawBody 원본 요청 본문 문자열(파싱 전).
 */
export function verifyWebhook(rawBody: string, headers: {
  id?: string | null; timestamp?: string | null; signature?: string | null;
}): boolean {
  const secret = process.env.PORTONE_WEBHOOK_SECRET;
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let secretBytes: Buffer;
  try { secretBytes = Buffer.from(key, "base64"); } catch { return false; }

  const signed = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signed).digest("base64");

  // webhook-signature 는 "v1,sig1 v1,sig2" 형태일 수 있음 → 하나라도 일치하면 OK
  const candidates = headers.signature.split(" ").map((p) => p.includes(",") ? p.split(",")[1] : p);
  return candidates.some((c) => {
    try { return crypto.timingSafeEqual(Buffer.from(c), Buffer.from(expected)); } catch { return false; }
  });
}
