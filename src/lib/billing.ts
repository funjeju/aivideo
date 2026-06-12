import { adminDb } from "./firebase/admin";
import { TargetLength } from "./types";

/** 길이별 예상 외부 API 원가(USD). 승인 단계 잔액 확인용. (01-core.md 추정치) */
const ESTIMATED_COST: Record<number, number> = {
  50: 2.0,
  180: 5.5,
  600: 7.0,
};

export function estimateCost(targetLength: number): number {
  return ESTIMATED_COST[targetLength] ?? 5.5;
}

/** 전역 과금 활성화 여부 (settings/global). 기본 false(무료). */
export async function isBillingEnabled(): Promise<boolean> {
  const snap = await adminDb().collection("settings").doc("global").get();
  return snap.exists ? snap.data()?.billingEnabled === true : false;
}

export interface BillingGate {
  /** 과금 적용 대상이며 잔액이 충분한가 (또는 면제/비활성으로 통과) */
  allowed: boolean;
  reason?: "insufficient_credits";
  /** 과금이 실제 적용되는지 (차감 대상) */
  charged: boolean;
  credits: number;
  estimate: number;
}

/**
 * 과금 게이트 판단.
 * - 토글 OFF 또는 면제 계정 → 항상 통과(charged=false)
 * - 토글 ON & 비면제 → 잔액이 예상비용 이상이어야 통과
 */
export async function checkBillingGate(userId: string, targetLength: number): Promise<BillingGate> {
  const estimate = estimateCost(targetLength);
  const userSnap = await adminDb().collection("users").doc(userId).get();
  const credits = (userSnap.data()?.credits as number) ?? 0;
  const exempt = userSnap.data()?.billingExempt === true;

  const enabled = await isBillingEnabled();
  if (!enabled || exempt) {
    return { allowed: true, charged: false, credits, estimate };
  }
  if (credits >= estimate) {
    return { allowed: true, charged: true, credits, estimate };
  }
  return { allowed: false, reason: "insufficient_credits", charged: true, credits, estimate };
}
