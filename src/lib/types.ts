import { Timestamp } from "firebase/firestore";

export type UserRole = "user" | "staff" | "superadmin";
export type UiLocale = "ko" | "en";
export type ThemePref = "light" | "dark" | "system";
export type ProjectStatus =
  | "draft"
  | "script_ready"
  | "approved"
  | "generating"
  | "rendering"
  | "done"
  | "error";
export type ProjectMode = "generate" | "faithful";
/** 목표 영상 길이(초). 유저가 슬라이더로 자유 입력(20~1200). */
export type TargetLength = number;
export type AspectRatio = "9:16" | "16:9" | "1:1";
export type StylePackId = "whiteboard" | "ink-wash" | "minhwa" | "doodle-edu" | "joseon-reaper" | "flat-icon" | "retro-poster" | "dark-neon" | "3d-iso" | "newspaper-cartoon" | "comic-essay" | "collage" | "drone-light" | "graphic-novel" | "cinematic-hype" | "euro-graphic-novel" | "pop-art" | "webtoon";
export type RenderJobType = "full" | "partial";
export type RenderJobStatus = "queued" | "running" | "done" | "error";
export type ImageStatus = "pending" | "done" | "error";
export type VoiceProvider = "elevenlabs" | "openai";
export type VoiceTier = "free" | "premium";
export type TextStrategy = "in-image" | "overlay" | "hybrid";
export type BrushType =
  | "round" | "dry" | "flat" | "bristle" | "ink"
  | "pencil" | "charcoal" | "watercolor" | "crayon";

export interface UserSubscription {
  tier: "free" | "tier1" | "tier2" | "tier3";
  status: "active" | "canceled" | "past_due";
  currentPeriodEnd: number;   // epoch ms
  billingKey?: string;        // 포트원 빌링키(정기결제)
  lastGrantedPeriod?: string; // 'YYYY-MM' — 같은 주기 중복충전 방지
}

export interface UserDoc {
  email: string;
  displayName: string;
  plan: string;
  credits: number;
  role: UserRole;
  uiLocale: UiLocale;
  themePref: ThemePref;
  /** 과금 면제 (true면 토글 ON이어도 무제한) */
  billingExempt?: boolean;
  /** 무료 체험 사용 편수(런칭 비용 보호 하드캡) */
  freeVideosUsed?: number;
  /** 구독 상태(구독제). 없으면 무료. */
  subscription?: UserSubscription;
  createdAt: Timestamp;
}

export interface GlobalSettings {
  /** 과금 적용 여부. false면 모두 무료. */
  billingEnabled: boolean;
  updatedAt?: Timestamp;
}

export interface ProjectDoc {
  ownerId: string;
  title: string;
  mode: ProjectMode;
  sourceText: string;
  sourceFileUrl?: string;
  showBrush?: boolean;
  targetLength: TargetLength;
  aspect: AspectRatio;
  stylePackId: StylePackId;
  voiceId: string;
  contentLocale: string;
  status: ProjectStatus;
  scriptApproved: boolean;
  /** 대시보드 썸네일 URL (제목이 합성되어 구워진 이미지) */
  thumbnailUrl?: string;
  /** 썸네일 원본으로 고른 장면 이미지 URL (선택 하이라이트용) */
  thumbnailSourceUrl?: string;
  /** 썸네일에 합성할 자극적 훅 문구 (LLM 생성, 사용자 수정 가능) */
  thumbnailHook?: string;
  /** 썸네일 배경으로 쓸 대표 장면의 order (LLM 선정) */
  keySceneOrder?: number;
  /** 업소용(기업 홍보) 영상이면 브랜드 메타 — 매 장면 이미지에 사명/로고를 반영한다 */
  corporate?: CorporateBrand;
  /** 캐릭터 참조 이미지(전역 1장). 인물 등장 장면에 "느낌만" 반영해 화풍으로 그린다 */
  characterRefUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 기업 홍보 영상의 브랜드 정보. 이미지 생성 단계에서 매 장면 프롬프트에 주입된다. */
export interface CorporateBrand {
  /** 회사명(국문) — 화면 간판/라벨에 정확 표기 지시 */
  companyKo?: string;
  /** 회사명(영문) */
  companyEn?: string;
  /** 업로드된 로고의 공개 Storage URL */
  logoUrl?: string;
  /** true면 로고를 images.edit reference로 매 장면에 반영 시도 */
  useLogoRef?: boolean;
  /** 업로드된 업소 실제 사진들(외관·메뉴·내부 등). 생성 시 적합한 장면에 화풍 변환해 사용 */
  photos?: { url: string; label: string }[];
}

export interface RevealObject {
  id: string;
  /** 정규화 0~1000 좌표 [x1,y1,x2,y2] — 이미지 비율 무관 (renderCore BBOX_NORM과 정합) */
  bbox: [number, number, number, number];
  role: "title" | "label" | "illustration" | "arrow" | "shape";
  revealOrder?: number;
  strokeStyle?: "brush" | "outline" | "fill";
  flowDirection?: string;
  startAt?: number;
  endAt?: number;
  caption?: string;
  /** 이 객체가 대응하는 나레이션 구절 (시간 동기화 앵커) */
  anchorText?: string;
}

export interface SceneSpec {
  sceneId: string;
  order: number;
  durationSec: number;
  narration: string;
  audioUrl?: string;
  canvas: {
    aspect: "9:16" | "16:9" | "1:1";
    background: string;
  };
  image?: {
    url: string;
    fit: "contain" | "cover";
  };
  reveal?: {
    objects: RevealObject[];
  };
  camera?: Array<{ at: number; scale: number; x: number; y: number }>;
  overlays?: Array<{ type: string; asset: string; opacity?: number; pos?: [number, number]; trigger?: string }>;
  hand?: { enabled: boolean; asset: string; size?: number; count?: number; speed?: number; brushType?: BrushType; inkSpread?: number; fillRange?: number };
  /** 그리기 흐름: sync(나레이션 동기) | topdown(위→아래). 표시·diff용으로 sceneSpec에 기록. */
  flowMode?: "sync" | "topdown";
  /** 하단 자막 표시 (기본 true). 나레이션 구절을 음성에 맞춰 자동 표시 */
  subtitles?: boolean;

  /** 사용자가 처리(생성/렌더) 중단을 요청 — 생성 루프·워커가 사이사이 확인해 멈춘다 */
  cancelRequested?: boolean;
}

export interface SceneDoc {
  order: number;
  narration: string;
  durationSec: number;
  sceneSpec?: SceneSpec;
  imageUrl?: string;
  imageStatus: ImageStatus;
  audioUrl?: string;
  visualIntent?: string;
  /** 업소용: 이 장면에 쓸 업소 사진 인덱스(corporate.photos[i]). 매칭 단계에서 지정 */
  usePhotoIndex?: number;
}

export interface CostLog {
  imageCount?: number;
  imageQuality?: string;
  imageCostUsd?: number;
  imageRegenerations?: number;
  ttsCharCount?: number;
  ttsCostUsd?: number;
  llmCostUsd?: number;
  renderSeconds?: number;
  renderCostUsd?: number;
  totalCostUsd?: number;
}

export interface RenderJobDoc {
  projectId: string;
  ownerId: string;
  type: RenderJobType;
  sceneIds?: string[];
  status: RenderJobStatus;
  progress: number;
  outputUrl?: string;
  costLog?: CostLog;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StylePackDoc {
  id: StylePackId;
  name: string;
  description: string;
  imagePrompt: {
    template: string;
    negative: string;
    model: string;
    quality: string;
    size: string;
  };
  textStrategy: TextStrategy;
  fontTitle: string;
  fontLabel: string;
  overlays: Array<{ type: string; asset: string; opacity?: number; trigger?: string }>;
  plannerDefaults: {
    revealStyle: string;
    strokeStyle: string;
    flowDirection: string;
    rhythm: string;
    handTool: string;
  };
  palette: { ink: string; accent: string; paper: string };
  userSliders: Record<string, { min: number; max: number; default: number }>;
  enabled: boolean;
  thumbnailUrls: string[];
  sortOrder: number;
  badge?: "new" | "beta";
}

export interface VoiceDoc {
  id: string;
  provider: VoiceProvider;
  providerVoiceId: string;
  displayName: string;
  language: string;
  gender: "male" | "female" | "neutral";
  tags: string[];
  previewUrl?: string;
  enabled: boolean;
  tier: VoiceTier;
}
