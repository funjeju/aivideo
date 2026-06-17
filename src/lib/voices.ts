/**
 * 통합 보이스 레지스트리 — TTS provider(openai/google)를 한 곳에서 관리.
 * 새 보이스/프로바이더는 여기만 추가하면 tts·미리듣기·생성 모두 반영된다.
 */
export type TtsProvider = "openai" | "google";

export interface VoiceDef {
  id: string;          // 내부 식별자(프로젝트 voiceId, 미리듣기 파일명)
  name: string;        // 사용자 표시 라벨
  provider: TtsProvider;
  gender: "female" | "male";
  /** google일 때 실제 보이스 이름 (예: ko-KR-Chirp3-HD-Puck) */
  googleName?: string;
}

export const VOICES: VoiceDef[] = [
  // ── Google Chirp3-HD (한국어 원어민, 자연스러움 최상) ──
  { id: "kr-aoede", name: "산뜻한 여성", provider: "google", gender: "female", googleName: "ko-KR-Chirp3-HD-Aoede" },
  { id: "kr-kore", name: "또렷한 여성", provider: "google", gender: "female", googleName: "ko-KR-Chirp3-HD-Kore" },
  { id: "kr-leda", name: "발랄한 여성", provider: "google", gender: "female", googleName: "ko-KR-Chirp3-HD-Leda" },
  { id: "kr-callirrhoe", name: "편안한 여성", provider: "google", gender: "female", googleName: "ko-KR-Chirp3-HD-Callirrhoe" },
  { id: "kr-charon", name: "차분한 남성", provider: "google", gender: "male", googleName: "ko-KR-Chirp3-HD-Charon" },
  { id: "kr-puck", name: "경쾌한 남성", provider: "google", gender: "male", googleName: "ko-KR-Chirp3-HD-Puck" },
  { id: "kr-fenrir", name: "활달한 남성", provider: "google", gender: "male", googleName: "ko-KR-Chirp3-HD-Fenrir" },
  { id: "kr-orus", name: "단단한 남성", provider: "google", gender: "male", googleName: "ko-KR-Chirp3-HD-Orus" },

  // ── OpenAI tts-1 (기존, 폴백·다국어) ──
  { id: "nova", name: "따뜻한 여성 (OpenAI)", provider: "openai", gender: "female" },
  { id: "shimmer", name: "차분한 여성 (OpenAI)", provider: "openai", gender: "female" },
  { id: "coral", name: "밝은 여성 (OpenAI)", provider: "openai", gender: "female" },
  { id: "onyx", name: "중후한 남성 (OpenAI)", provider: "openai", gender: "male" },
  { id: "echo", name: "낮은 남성 (OpenAI)", provider: "openai", gender: "male" },
  { id: "ash", name: "담담한 남성 (OpenAI)", provider: "openai", gender: "male" },
];

const BY_ID = new Map(VOICES.map((v) => [v.id, v]));

/** voiceId로 보이스 정의 조회. 없으면 기본(첫 Google 보이스). */
export function getVoice(id: string | undefined): VoiceDef {
  return (id && BY_ID.get(id)) || VOICES[0];
}
