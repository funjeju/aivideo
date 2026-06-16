// worker 격리본 — 메인 src/lib/types.ts에서 renderCore가 쓰는 타입만 발췌.
// 수정 시 메인과 동기화.

export type BrushType =
  | "round" | "dry" | "flat" | "bristle" | "ink"
  | "pencil" | "charcoal" | "watercolor" | "crayon";

export interface RevealObject {
  id: string;
  /** 정규화 0~1000 좌표 [x1,y1,x2,y2] */
  bbox: [number, number, number, number];
  role: "title" | "label" | "illustration" | "arrow" | "shape";
  revealOrder?: number;
  strokeStyle?: "brush" | "outline" | "fill";
  flowDirection?: string;
  startAt?: number;
  endAt?: number;
  caption?: string;
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
  subtitles?: boolean;
}
