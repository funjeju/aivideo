import { adminDb } from "./firebase/admin";
import { sceneCountForLength } from "./length";

/** 무료(비면제) 사용자 한도 — 런칭 전 비용 보호. 결제/티어 도입 전 임시 하드캡. */
export const FREE_VIDEO_LIMIT = 2;       // 최대 2편
export const FREE_MAX_LENGTH = 60;       // 편당 최대 1분

/** 면제 여부: billingExempt 또는 운영자(staff/superadmin)는 한도 미적용. */
export function isExemptUser(u: { billingExempt?: boolean; role?: string } | undefined): boolean {
  return !!u && (u.billingExempt === true || u.role === "staff" || u.role === "superadmin");
}

/**
 * 예상 외부 API 원가(USD). 승인 단계 잔액 확인용.
 * 장면 수에 비례: 장면당 이미지($0.19)+TTS+렌더 ≈ $0.25, 기본 오버헤드 $0.5.
 * (길이 자유 입력이므로 고정표 대신 계산)
 */
export function estimateCost(targetLength: number): number {
  const scenes = sceneCountForLength(targetLength);
  return Math.round((scenes * 0.25 + 0.5) * 10) / 10;
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
