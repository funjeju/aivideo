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
export type StylePackId = "whiteboard" | "ink-wash" | "minhwa" | "doodle-edu" | "joseon-reaper" | "flat-icon" | "retro-poster" | "dark-neon" | "3d-iso" | "newspaper-cartoon" | "comic-essay" | "collage" | "drone-light";
export type RenderJobType = "full" | "partial";
export type RenderJobStatus = "queued" | "running" | "done" | "error";
export type ImageStatus = "pending" | "done" | "error";
export type VoiceProvider = "elevenlabs" | "openai";
export type VoiceTier = "free" | "premium";
export type TextStrategy = "in-image" | "overlay" | "hybrid";
export type BrushType =
  | "round" | "dry" | "flat" | "bristle" | "ink"
  | "pencil" | "charcoal" | "watercolor" | "crayon";

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
