import { adminDb } from "./firebase/admin";
import { creditsForVideo, getTier } from "./pricing";
import type { Subscription } from "./credits";

/** 무료(비구독·비면제) 사용자 한도 — 런칭 전 비용 보호. */
export const FREE_VIDEO_LIMIT = 2;       // 최대 2편
export const FREE_MAX_LENGTH = 60;       // 편당 최대 1분

/** 면제 여부: billingExempt 또는 운영자(staff/superadmin)는 한도/차감 미적용. */
export function isExemptUser(u: { billingExempt?: boolean; role?: string } | undefined): boolean {
  return !!u && (u.billingExempt === true || u.role === "staff" || u.role === "superadmin");
}

/** 활성 구독 티어 id (없거나 만료/해지+기간경과면 'free'). */
export function activeTierId(u: { subscription?: Subscription } | undefined): string {
  const s = u?.subscription;
  if (!s) return "free";
  const valid = s.status === "active" || (s.status === "canceled" && s.currentPeriodEnd > Date.now());
  return valid ? s.tier : "free";
}

/** 이 사용자가 만들 수 있는 영상 최대 길이(초). 면제는 무제한(플랫폼 상한). */
export function maxLengthForUser(u: { billingExempt?: boolean; role?: string; subscription?: Subscription } | undefined): number {
  if (isExemptUser(u)) return 600;
  return getTier(activeTierId(u)).maxLengthSec;
}

/** 이 영상 1편에 필요한 크레딧(= 사용자에게 보여주는 차감 값). */
export function estimateCredits(targetLength: number): number {
  return creditsForVideo(targetLength);
}

/** 전역 과금 활성화 여부 (settings/global). 기본 false(무료). */
export async function isBillingEnabled(): Promise<boolean> {
  const snap = await adminDb().collection("settings").doc("global").get();
  return snap.exists ? snap.data()?.billingEnabled === true : false;
}

export interface BillingGate {
  allowed: boolean;
  reason?: "insufficient_credits";
  charged: boolean;     // 실제 차감 대상인지(토글 ON & 비면제)
  credits: number;      // 현재 잔액
  estimate: number;     // 필요 크레딧
}

/**
 * 과금 게이트 판단(잔액 확인만 — 실제 차감은 credits.holdCredits로).
 * - 토글 OFF 또는 면제 → 통과(charged=false)
 * - 토글 ON & 비면제 → 잔액이 필요 크레딧 이상이어야 통과
 */
export async function checkBillingGate(userId: string, targetLength: number): Promise<BillingGate> {
  const estimate = estimateCredits(targetLength);
  const userSnap = await adminDb().collection("users").doc(userId).get();
  const u = userSnap.data() ?? {};
  const credits = (u.credits as number) ?? 0;

  const enabled = await isBillingEnabled();
  if (!enabled || isExemptUser(u)) {
    return { allowed: true, charged: false, credits, estimate };
  }
  if (credits >= estimate) {
    return { allowed: true, charged: true, credits, estimate };
  }
  return { allowed: false, reason: "insufficient_credits", charged: true, credits, estimate };
}
