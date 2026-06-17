import { StylePackId } from "@/lib/types";
import { VOICES } from "@/lib/voices";

/**
 * 랜딩 페이지 템플릿 갤러리 / 목소리 샘플 설정.
 * - 썸네일은 Storage style-samples/{id}.png 재활용(추가 트래픽 0).
 * - 영상은 YouTube 임베드(우리 트래픽 0). youtubeId 비면 "곧 공개"로 표시.
 *   → 유튜브에 샘플 업로드하면 여기 id만 채우면 라이브됨.
 */
const STYLE_BASE = "https://storage.googleapis.com/golpo-b6407.firebasestorage.app/style-samples";

export interface TemplateSample {
  id: StylePackId;
  name: string;
  desc: string;
  poster: string;
  youtubeId: string; // 비우면 "곧 공개"
}

export const TEMPLATE_SAMPLES: TemplateSample[] = [
  { id: "whiteboard", name: "클래식 화이트보드", desc: "깔끔한 설명 영상의 기본기", youtubeId: "" },
  { id: "doodle-edu", name: "낙서 교육", desc: "마커 낙서체, 교육 유튜브 감성", youtubeId: "" },
  { id: "ink-wash", name: "수묵담채", desc: "한지 위 먹선, 심리·철학·역사", youtubeId: "" },
  { id: "joseon-reaper", name: "조선 저승사자", desc: "수묵 산수 + 갓 쓴 내레이터", youtubeId: "" },
  { id: "flat-icon", name: "플랫 아이콘", desc: "또렷한 플랫 컬러 아이콘", youtubeId: "" },
  { id: "retro-poster", name: "레트로 포스터", desc: "미드센추리 빈티지 감성", youtubeId: "" },
  { id: "dark-neon", name: "다크 네온", desc: "어두운 배경 + 네온 글로우", youtubeId: "" },
  { id: "3d-iso", name: "3D 아이소메트릭", desc: "입체 블록, 또렷한 입체감", youtubeId: "" },
  { id: "newspaper-cartoon", name: "신문 만평", desc: "흑백 캐리커처, 시사·풍자", youtubeId: "" },
  { id: "comic-essay", name: "만화책", desc: "웹툰 에세이체, 이야기로 기억", youtubeId: "" },
  { id: "collage", name: "콜라주", desc: "오려붙임, 빈티지·풍자", youtubeId: "" },
  { id: "minhwa", name: "민화 / 조선", desc: "오방색 모티프, 한국사·문화", youtubeId: "" },
  { id: "drone-light", name: "드론 라이트쇼", desc: "밤하늘 빛점이 모여 형상을 빚어냄", youtubeId: "" },
].map((t) => ({ ...t, poster: `${STYLE_BASE}/${t.id}.png` })) as TemplateSample[];

const LANDING_BASE = "https://storage.googleapis.com/golpo-b6407.firebasestorage.app/landing";

/**
 * 메인페이지 "이렇게 만들어집니다" 워크플로우 — 실제 제품 화면 스크린샷으로 단계 설명.
 * 스크린샷은 Storage landing/workflow/{key}.png 에 올린다. 없으면 단계 번호 placeholder 표시.
 */
export interface WorkflowStep {
  key: string;
  emoji: string;
  title: string;
  caption: string;
  /** 상세 매뉴얼 단계별 설명(펼침 시) */
  details: string[];
  /** 상세 매뉴얼 스크린샷 URL들(펼침 시에만 로드 — 트래픽 절약). Storage landing/manual/ */
  shots: string[];
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    key: "input", emoji: "📝", title: "주제 한 줄, 스타일 선택",
    caption: "만들 주제만 입력하고 길이·화면비율·화풍·목소리를 고르세요. 자료 업로드와 업소용 영상도 지원합니다.",
    details: [
      "‘주제로 생성 · 자료 업로드 · 업소용’ 중 선택",
      "영상 길이를 슬라이더로(1~10분) — 길이에 맞춰 장면 수가 자동 결정",
      "화면 비율: 세로(숏폼·릴스) · 가로(유튜브) · 정사각(피드)",
      "13가지 화풍 카드에서 원하는 그림체 선택",
      "나레이션 목소리 9종 중 선택 후 ‘영상 생성 시작’",
    ],
  },
  {
    key: "script", emoji: "✍️", title: "AI 원고 확인·수정",
    caption: "AI가 장면별 나레이션을 써줍니다. 마음에 안 드는 문장은 바로 고치세요 — 자동 저장됩니다.",
    details: [
      "AI가 장면(01, 02 …)별로 나레이션을 자동 작성",
      "각 문장을 직접 수정 가능 — 수정 즉시 자동 저장",
      "승인하면 이 원고를 기준으로 음성·이미지가 생성됨",
    ],
  },
  {
    key: "generate", emoji: "🎬", title: "그려지며 말합니다",
    caption: "이미지·음성·드로잉 연출을 자동 합성. 말하는 순간에 맞춰 그림이 그려집니다.",
    details: [
      "음성 합성 → 이미지 생성 → 연출(드로잉 순서) 자동 진행",
      "단계별 진행률을 실시간 표시",
      "나레이션이 발화되는 순간에 맞춰 그림이 그려지는 ‘드로잉-리빌’",
    ],
  },
  {
    key: "done", emoji: "📤", title: "완성 · 다운로드 · 공유",
    caption: "mp4로 내려받고 공유 링크 한 번에. 마음에 안 드는 장면만 부분 수정도 가능합니다.",
    details: [
      "브라우저 미리보기로 확인 후 ‘mp4로 만들기’",
      "공유 썸네일 자동 생성(문구·장면 직접 수정 가능)",
      "mp4 다운로드 + 공유 링크 복사(카톡·SNS 미리보기 지원)",
      "마음에 안 드는 장면만 부분 수정 후 재렌더",
    ],
  },
].map((s) => ({ ...s, shots: [`${LANDING_BASE}/manual/${s.key}.png`] }));

export interface VoiceSample {
  id: string;
  name: string;
  preview: string;
}

// 통합 보이스 레지스트리에서 — 미리듣기는 /api/voice-preview가 생성·캐시(첫 재생 시 1회).
export const VOICE_SAMPLES: VoiceSample[] = VOICES.map((v) => ({
  id: v.id,
  name: v.name,
  preview: `/api/voice-preview?voiceId=${v.id}`,
}));
