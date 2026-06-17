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

export function portoneClientConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_PORTONE_STORE_ID && !!process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;
}

/**
 * 카드 등록창을 띄워 빌링키를 발급받는다(정기결제용).
 * @returns 발급된 billingKey. 사용자가 취소/실패하면 throw.
 */
export async function issueBillingKey(customer: {
  customerId: string;
  fullName?: string;
  email?: string;
}): Promise<string> {
  const PortOne = await loadSdk();
  const res = await PortOne.requestIssueBillingKey({
    storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID,
    channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY,
    billingKeyMethod: "CARD",
    issueId: `bk_${customer.customerId}_${Date.now()}`,
    issueName: "Easyshorts 구독 카드 등록",
    customer: {
      customerId: customer.customerId,
      fullName: customer.fullName,
      email: customer.email,
    },
  });
  if (res.code != null) throw new Error(res.message || "카드 등록이 취소되었습니다");
  if (!res.billingKey) throw new Error("빌링키 발급 실패");
  return res.billingKey;
}
