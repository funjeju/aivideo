/** 목표 영상 길이(초) 관련 공유 헬퍼. UI 라벨 · 장면 수 계산을 한 곳에서. */

/** 길이 입력 허용 범위(초). 슬라이더/검증 공용. */
export const MIN_LENGTH = 20;
export const MAX_LENGTH = 1200; // 20분

/** 판서 1장면 = 약 10초(나레이션 40~48자). 길이 → 장면 수. */
export const SECONDS_PER_SCENE = 10;

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
