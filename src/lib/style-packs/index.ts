import { StylePackDoc } from "@/lib/types";

export const STYLE_PACKS: Record<string, StylePackDoc> = {
  whiteboard: {
    id: "whiteboard",
    name: "클래식 화이트보드",
    description: "깔끔한 설명 영상 기본기. 교수 세그먼트 디폴트.",
    imagePrompt: {
      template:
        "whiteboard explainer illustration, {subject}, clean black marker lines on white background, simple bold strokes, educational diagram style, no color, no shading. IMPORTANT: arrange distinct elements with generous empty space between them, each element clearly separated and not overlapping, so they can be drawn one by one",
      negative: "photorealistic, 3d render, color, complex background, cluttered, overlapping elements, dense layout",
      model: "gpt-image-2",
      quality: "high",
      size: "1024x1536",
    },
    textStrategy: "hybrid",
    fontTitle: "Pretendard",
    fontLabel: "Pretendard",
    overlays: [],
    plannerDefaults: {
      revealStyle: "left-to-right",
      strokeStyle: "outline",
      flowDirection: "left-to-right",
      rhythm: "fast-beat",
      handTool: "marker",
    },
    palette: { ink: "#2A2A2E", accent: "#C73E3A", paper: "#FFFFFF" },
    userSliders: {
      lineWeight: { min: 0, max: 1, default: 0.5 },
    },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 1,
  },

  "ink-wash": {
    id: "ink-wash",
    name: "수묵담채",
    description: "한지 위 먹선과 담채. 심리·철학·역사 콘텐츠용.",
    imagePrompt: {
      template:
        "korean ink wash painting (sumukhwa), {subject}, soft diffused ink lines, light watercolor accents, generous negative space, hanji paper texture, minimal, elegant, traditional Korean art style",
      negative: "photorealistic, 3d render, neon, heavy saturation, western style, crowded",
      model: "gpt-image-2",
      quality: "high",
      size: "1024x1536",
    },
    textStrategy: "hybrid",
    fontTitle: "Nanum Brush Script",
    fontLabel: "Pretendard",
    overlays: [
      { type: "texture", asset: "hanji.png", opacity: 0.15 },
      { type: "stamp", asset: "nakgwan.png", trigger: "end" },
    ],
    plannerDefaults: {
      revealStyle: "symbol-first",
      strokeStyle: "brush",
      flowDirection: "right-to-left",
      rhythm: "slow-breath",
      handTool: "brush",
    },
    palette: { ink: "#2A2A2E", accent: "#3A6B5C", paper: "#FAF8F4" },
    userSliders: {
      colorTemperature: { min: -1, max: 1, default: 0 },
      whitespaceDensity: { min: 0, max: 1, default: 0.6 },
    },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 2,
  },

  minhwa: {
    id: "minhwa",
    name: "민화/조선",
    description: "호랑이·까치·책가도 모티프, 오방색 포인트. 한국사·문화용.",
    imagePrompt: {
      template:
        "Korean folk painting (minhwa), Joseon dynasty style, {subject}, bold outlines, obangsaek five traditional colors, flat perspective, decorative patterns, tiger and magpie motifs, folk art aesthetic",
      negative: "photorealistic, 3d render, western art, modern, minimalist",
      model: "gpt-image-2",
      quality: "high",
      size: "1024x1536",
    },
    textStrategy: "overlay",
    fontTitle: "Nanum Brush Script",
    fontLabel: "Pretendard",
    overlays: [
      { type: "texture", asset: "hanji.png", opacity: 0.1 },
    ],
    plannerDefaults: {
      revealStyle: "symbol-first",
      strokeStyle: "fill",
      flowDirection: "center-out",
      rhythm: "slow-breath",
      handTool: "brush",
    },
    palette: { ink: "#2A2A2E", accent: "#C73E3A", paper: "#FDF6E3" },
    userSliders: {
      colorVibrancy: { min: 0, max: 1, default: 0.7 },
    },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 3,
  },
};

export function getStylePack(id: string): StylePackDoc {
  return STYLE_PACKS[id] ?? STYLE_PACKS.whiteboard;
}

/** 비율 → GPT Image 2 지원 해상도 (canvas.aspect와 정합) */
export function imageSizeForAspect(aspect: string): "1024x1024" | "1024x1536" | "1536x1024" {
  switch (aspect) {
    case "16:9": return "1536x1024";
    case "1:1": return "1024x1024";
    case "9:16":
    default: return "1024x1536";
  }
}
