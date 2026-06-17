/** 목표 영상 길이(초) 관련 공유 헬퍼. UI 라벨 · 장면 수 계산을 한 곳에서. */

/** 길이 입력 허용 범위(초). 슬라이더/검증 공용. */
export const MIN_LENGTH = 20;
export const MAX_LENGTH = 600; // 플랫폼 최대 10분. (요금제: 무료/Lite ≤5분, Pro ≤10분 — 빌링 도입 시 등급별 제한)

/**
 * 판서 1장면(이미지 1장) = 약 7초. 길이 → 장면 수.
 * TTS 실측 속도 ~7자/초 기준 7초 ≈ 50자. (이전 4.3자/초 가정은 오류로 길이가 60%만 채워졌었음)
 */
export const SECONDS_PER_SCENE = 7;
/** TTS 실측 한국어 발화 속도(자/초). 나레이션 분량 산정 기준. */
export const CHARS_PER_SECOND = 7;

export function sceneCountForLength(targetLength: number): number {
  return Math.max(1, Math.round(targetLength / SECONDS_PER_SCENE));
}

/** 초 → "50초" / "3분" / "3분 20초" 표시. */
export function formatLength(sec: number): string {
  if (!sec || sec < 60) return `${Math.round(sec)}초`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}
