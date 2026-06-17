"use client";

/**
 * 포트원 V2 브라우저 SDK 로더 + 빌링키(카드 등록) 발급.
 * CDN 스크립트(window.PortOne)를 동적 로드해 의존성 추가 없이 사용.
 */

type PortOneSDK = {
  requestIssueBillingKey: (req: Record<string, unknown>) => Promise<{
    code?: string | null;
    message?: string;
    billingKey?: string;
  }>;
};

declare global {
  interface Window { PortOne?: PortOneSDK }
}

let loading: Promise<PortOneSDK> | null = null;

function loadSdk(): Promise<PortOneSDK> {
  if (typeof window === "undefined") return Promise.reject(new Error("브라우저 전용"));
  if (window.PortOne) return Promise.resolve(window.PortOne);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.portone.io/v2/browser-sdk.js";
    s.onload = () => window.PortOne ? resolve(window.PortOne) : reject(new Error("PortOne SDK 초기화 실패"));
    s.onerror = () => reject(new Error("PortOne SDK 로드 실패"));
    document.head.appendChild(s);
  });
  return loading;
}

export type PayMethod = "CARD" | "KAKAOPAY";

const CARD_CHANNEL = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;
const KAKAO_CHANNEL = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_KAKAO;

export function portoneClientConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_PORTONE_STORE_ID && !!CARD_CHANNEL;
}

/** 사용 가능한 결제수단(채널키가 설정된 것만). */
export function availableMethods(): PayMethod[] {
  const m: PayMethod[] = [];
  if (CARD_CHANNEL) m.push("CARD");
  if (KAKAO_CHANNEL) m.push("KAKAOPAY");
  return m;
}

/**
 * 결제수단 등록창(카드/카카오 자동결제)을 띄워 빌링키를 발급받는다(정기결제용).
 * @returns 발급된 billingKey. 사용자가 취소/실패하면 throw.
 */
export async function issueBillingKey(
  method: PayMethod,
  customer: {
    customerId: string;
    fullName?: string;
    email?: string;
    phoneNumber: string; // 이니시스 V2 빌링키 발급 필수
  },
): Promise<string> {
  const PortOne = await loadSdk();
  const channelKey = method === "KAKAOPAY" ? KAKAO_CHANNEL : CARD_CHANNEL;
  if (!channelKey) throw new Error("결제수단 채널이 설정되지 않았습니다");

  const res = await PortOne.requestIssueBillingKey({
    storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID,
    channelKey,
    billingKeyMethod: method === "KAKAOPAY" ? "EASY_PAY" : "CARD",
    // 이니시스 oid 길이 제한(≤40) — uid 미포함 짧은 고유값. (uid는 customer.customerId로 전달)
    issueId: `bk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    issueName: "Easyshorts 구독 결제수단 등록",
    customer: {
      customerId: customer.customerId,
      fullName: customer.fullName,
      email: customer.email,
      phoneNumber: customer.phoneNumber,
    },
  });
  if (res.code != null) throw new Error(res.message || "결제수단 등록이 취소되었습니다");
  if (!res.billingKey) throw new Error("빌링키 발급 실패");
  return res.billingKey;
}
