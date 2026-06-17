/**
 * 요금 단일 출처(Single Source of Truth).
 * - 크레딧 단위: **1 크레딧 = 영상 1분** (2분이면 2크레딧, 30초도 1크레딧 — 분 올림).
 *   화질은 low 고정이라 원가는 길이(분)에만 비례 → 분 단위 크레딧이 가장 직관적.
 * - 티어 차이는 월 포함 크레딧(=분) · 멀티큐(동시제작) · 최대 길이 · 워터마크.
 * 클라이언트 표시(pricing/랜딩)와 서버 게이트가 이 값을 공유한다.
 */

export type TierId = "free" | "tier1" | "tier2" | "tier3";

/** 참고: 1크레딧(=1분) ≈ 약 990원 (1분 원가 ~390원 × 2.5). 표시·정산 참고용. */
export const KRW_PER_CREDIT_APPROX = 990;

export interface TierSpec {
  id: TierId;
  name: string;        // 표시명
  priceKrw: number;    // 월 정가(원)
  monthlyCredits: number; // 갱신 시 충전되는 포함 크레딧(=영상 분)
  maxLengthSec: number;   // 영상 최대 길이
  concurrency: number;    // 동시 제작(멀티큐) 한도
  watermark: boolean;     // 무료 워터마크 여부
}

export const TIERS: Record<TierId, TierSpec> = {
  free:  { id: "free",  name: "무료", priceKrw: 0,     monthlyCredits: 0,   maxLengthSec: 60,  concurrency: 1, watermark: true },
  tier1: { id: "tier1", name: "Lite", priceKrw: 9900,  monthlyCredits: 10,  maxLengthSec: 300, concurrency: 1, watermark: false },
  tier2: { id: "tier2", name: "Pro",  priceKrw: 29000, monthlyCredits: 35,  maxLengthSec: 600, concurrency: 3, watermark: false },
  tier3: { id: "tier3", name: "VIP",  priceKrw: 99000, monthlyCredits: 130, maxLengthSec: 600, concurrency: 5, watermark: false },
};

export function getTier(id: string | undefined | null): TierSpec {
  return (id && (TIERS as Record<string, TierSpec>)[id]) || TIERS.free;
}

/**
 * 이 길이 영상 1편 생성에 필요한 크레딧(= 사용자에게 보여주는 차감 값).
 * 1크레딧 = 1분, 분 단위 올림(최소 1). 예: 30초→1, 60초→1, 90초→2, 5분→5.
 */
export function creditsForVideo(targetLength: number): number {
  return Math.max(1, Math.ceil(targetLength / 60));
}
