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
export type TargetLength = 50 | 180 | 600;
export type AspectRatio = "9:16" | "16:9" | "1:1";
export type StylePackId = "whiteboard" | "ink-wash" | "minhwa";
export type RenderJobType = "full" | "partial";
export type RenderJobStatus = "queued" | "running" | "done" | "error";
export type ImageStatus = "pending" | "done" | "error";
export type VoiceProvider = "elevenlabs" | "openai";
export type VoiceTier = "free" | "premium";
export type TextStrategy = "in-image" | "overlay" | "hybrid";

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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RevealObject {
  id: string;
  bbox: [number, number, number, number];
  role: "title" | "label" | "illustration" | "arrow" | "shape";
  revealOrder?: number;
  strokeStyle?: "brush" | "outline" | "fill";
  flowDirection?: string;
  startAt?: number;
  endAt?: number;
  caption?: string;
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
  hand?: { enabled: boolean; asset: string; size?: number };
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
