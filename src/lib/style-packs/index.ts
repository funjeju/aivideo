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
      quality: "medium",
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
      quality: "medium",
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

  "doodle-edu": {
    id: "doodle-edu",
    name: "낙서 교육",
    description: "한국 교육 유튜브 특유의 두꺼운 마커 낙서체. 스틱피겨·말풍선·컬러 키워드 강조.",
    imagePrompt: {
      template:
        "Korean educational YouTube whiteboard doodle style, {subject}, thick black marker outlines on pure white background, hand-drawn comic style with simple stick figure characters and icons, arrows connecting concepts, rounded boxy shapes, slightly imperfect wobble lines, cheerful educational infographic, flat 2D, no shading, no gradients. Picture-driven, NOT text-driven: rely on drawings and icons to convey meaning. Use at most 1-2 very short keyword labels (single words, 1-3 syllables) optionally highlighted in blue or red — absolutely NO sentences, NO paragraphs, NO dense text, NO walls of text, NO multiple text boxes. Generous empty space between distinct elements so they can be drawn one by one.",
      negative: "photorealistic, 3d, watercolor, ink wash, traditional, complex texture, dark background, gradient, shadow, realistic proportions, paragraphs, full sentences, dense text, walls of text, many text boxes, cluttered text, small unreadable text, speech bubbles full of text",
      model: "gpt-image-2",
      quality: "medium",
      size: "1024x1536",
    },
    textStrategy: "in-image",
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
    palette: { ink: "#1A1A1A", accent: "#2563EB", paper: "#FFFFFF" },
    userSliders: {
      lineWeight: { min: 0, max: 1, default: 0.7 },
    },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 4,
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
      quality: "medium",
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
