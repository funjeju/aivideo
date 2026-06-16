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

  "joseon-reaper": {
    id: "joseon-reaper",
    name: "조선 저승사자",
    description: "수묵 산수 배경 + 갓 쓴 저승사자 내레이터 + 미니 스틱피겨. 심리·경제·교양을 위트있게.",
    imagePrompt: {
      template:
        "Korean ink-and-brush educational illustration on aged hanji paper. MAIN FOCUS (fills most of the frame, centered): {subject} — drawn large and clearly with crisp dark brush outlines using simple stick-figure people, icons, objects, arrows and 1-2 short keyword labels. This concept content is different in every scene and is the star of the image. A small Joseon-era grim reaper host (저승사자: pale round face, tall black gat hat, black robe, folding fan) MAY appear modestly off to one side as a recurring guide — keep him small and secondary, not in the center, and not crowding the concept. Background: mostly empty hanji with only a few light ink-wash strokes; do NOT repeat the same mountain/pagoda/plum-blossom scenery across images — vary or omit the scenery. Muted sepia and black ink, sparse red accent only on key words, a small red seal stamp in a corner. Crisp outlines, generous spacing so each element can be drawn one by one. Minimal text, no sentences, no paragraphs.",
      negative: "photorealistic, 3d render, vivid saturated color, neon, modern flat vector, anime, cluttered, dense text, paragraphs, heavy color, large dominating background, repeated identical scenery, grim reaper filling the frame, same mountains every image",
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
      // 전경(인물/스틱피겨/말풍선)은 펜으로 그리고, 수묵 배경은 페이드인이 자연스럽다.
      revealStyle: "symbol-first",
      strokeStyle: "brush",
      flowDirection: "left-to-right",
      rhythm: "slow-breath",
      handTool: "brush",
    },
    palette: { ink: "#2A2A2E", accent: "#B23A2E", paper: "#EDE6D6" },
    userSliders: {
      colorTemperature: { min: -1, max: 1, default: 0 },
      whitespaceDensity: { min: 0, max: 1, default: 0.55 },
    },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 5,
  },

  "flat-icon": {
    id: "flat-icon",
    name: "플랫 아이콘",
    description: "깔끔한 플랫 컬러 아이콘 인포그래픽. 또렷한 외곽선 + 밝은 배경. 판서 최적.",
    imagePrompt: {
      template:
        "clean flat vector-style educational infographic illustration, {subject}, simple rounded flat icons and shapes with bold clear dark outlines, soft muted modern color palette, arrows connecting ideas, plenty of white space, light off-white background, NO gradients, NO shadows, NO 3d. Picture-driven: convey meaning with icons, use at most 1-2 short keyword labels (no sentences, no paragraphs). Each element clearly separated with generous empty space so they can be drawn one by one.",
      negative: "3d, isometric, neon, glow, photorealistic, gradient, drop shadow, dense text, paragraphs, cluttered, overlapping elements, dark background",
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
      handTool: "pen",
    },
    palette: { ink: "#2A2A2E", accent: "#2563EB", paper: "#FFFFFF" },
    userSliders: { lineWeight: { min: 0, max: 1, default: 0.4 } },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 6,
  },

  "retro-poster": {
    id: "retro-poster",
    name: "레트로 포스터",
    description: "미드센추리 빈티지 포스터. 따뜻한 색·굵은 외곽·할프톤 질감.",
    imagePrompt: {
      template:
        "retro mid-century vintage poster illustration, {subject}, warm muted palette (mustard, terracotta, teal, cream), bold dark outlines, simple flat shapes, subtle halftone grain texture, geometric infographic layout, arrows connecting ideas, warm cream background. Picture-driven, minimal text — only short keyword labels, no sentences, no paragraphs. Distinct elements with generous spacing and crisp outlines so they can be drawn one by one.",
      negative: "3d, isometric, neon, glow, photorealistic, smooth gradient, modern flat vector, dense text, paragraphs, cluttered, dark background",
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
    palette: { ink: "#3A2E26", accent: "#C75B39", paper: "#F3E9D6" },
    userSliders: { lineWeight: { min: 0, max: 1, default: 0.6 } },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 7,
  },

  "dark-neon": {
    id: "dark-neon",
    name: "다크 네온",
    description: "어두운 배경 + 네온 글로우. 펜이 빛나는 선을 그어나감.",
    imagePrompt: {
      template:
        "glowing neon educational infographic on a dark background, {subject}, bright luminous neon outlines in cyan, magenta, pink and purple, deep dark navy/black background, simple shapes and icons drawn with glowing strokes, subtle sparkles, minimal text — only short glowing keyword labels (no sentences, no paragraphs). Distinct elements with generous spacing and clear glowing outlines so they can be drawn one by one.",
      negative: "photorealistic, 3d, daylight, white background, paper texture, muted colors, gradient fills, dense text, paragraphs, cluttered",
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
      handTool: "pen",
    },
    palette: { ink: "#22D3EE", accent: "#E879F9", paper: "#0B0A14" },
    userSliders: { lineWeight: { min: 0, max: 1, default: 0.5 } },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 8,
  },

  "3d-iso": {
    id: "3d-iso",
    name: "3D 아이소메트릭",
    description: "3D 아이소메트릭 블록. 외곽선이 약해 채움범위↑로 페이드 리빌 권장.",
    imagePrompt: {
      template:
        "3D isometric educational illustration, {subject}, clean isometric blocks, objects and icons with soft shading and gentle depth, muted pastel color palette, subtle soft shadows, light neutral background, minimal text — only short keyword labels (no sentences, no paragraphs). Distinct objects with generous spacing.",
      negative: "neon, glow, photorealistic, flat 2d only, busy texture, dense text, paragraphs, dark background, harsh shadows",
      model: "gpt-image-2",
      quality: "medium",
      size: "1024x1536",
    },
    textStrategy: "hybrid",
    fontTitle: "Pretendard",
    fontLabel: "Pretendard",
    overlays: [],
    plannerDefaults: {
      // 외곽선이 약함 → 펜 트레이스보다 영역 채움(페이드) 위주. 어드민에서 채움범위·번짐 튜닝 권장.
      revealStyle: "center-out",
      strokeStyle: "fill",
      flowDirection: "center-out",
      rhythm: "slow-breath",
      handTool: "marker",
    },
    palette: { ink: "#3A3A44", accent: "#7C9CBF", paper: "#F2F1EE" },
    userSliders: { colorVibrancy: { min: 0, max: 1, default: 0.5 } },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 9,
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
