import { sceneCountForLength } from "./length";

/**
 * 요금 단일 출처(Single Source of Truth).
 * - 화질 low 고정 → 크레딧은 장면 수에만 비례. 1 크레딧 = 10원.
 * - 티어 차이는 월 포함 크레딧 · 멀티큐(동시제작) · 최대 길이 · 워터마크.
 * 클라이언트 표시(pricing 페이지/랜딩)와 서버 게이트가 이 값을 공유한다.
 */

export const CREDITS_PER_SCENE = 10; // low 고정 (1장면 ≈ 100원)
export const KRW_PER_CREDIT = 10;

export type TierId = "free" | "tier1" | "tier2" | "tier3";

export interface TierSpec {
  id: TierId;
  name: string;        // 표시명
  priceKrw: number;    // 월 정가(원)
  monthlyCredits: number; // 갱신 시 충전되는 포함 크레딧
  maxLengthSec: number;   // 영상 최대 길이
  concurrency: number;    // 동시 제작(멀티큐) 한도
  watermark: boolean;     // 무료 워터마크 여부
}

export const TIERS: Record<TierId, TierSpec> = {
  free:  { id: "free",  name: "무료", priceKrw: 0,     monthlyCredits: 0,     maxLengthSec: 60,  concurrency: 1, watermark: true },
  tier1: { id: "tier1", name: "Lite", priceKrw: 9900,  monthlyCredits: 1100,  maxLengthSec: 300, concurrency: 1, watermark: false },
  tier2: { id: "tier2", name: "Pro",  priceKrw: 29000, monthlyCredits: 3500,  maxLengthSec: 600, concurrency: 3, watermark: false },
  tier3: { id: "tier3", name: "VIP",  priceKrw: 99000, monthlyCredits: 13000, maxLengthSec: 600, concurrency: 5, watermark: false },
};

export function getTier(id: string | undefined | null): TierSpec {
  return (id && (TIERS as Record<string, TierSpec>)[id]) || TIERS.free;
}

/** 이 길이 영상 1편 생성에 필요한 크레딧(= 차감 단위, 사용자에게 보여주는 값과 동일). */
export function creditsForVideo(targetLength: number): number {
  return sceneCountForLength(targetLength) * CREDITS_PER_SCENE;
}

/** 장면 1개 재생성(편집) 단가. */
export const CREDITS_PER_REGEN = CREDITS_PER_SCENE;
/** 원고 수정 단가(장면당). */
export const CREDITS_PER_SCRIPT_EDIT = 2;
