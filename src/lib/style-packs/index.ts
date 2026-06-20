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

  "newspaper-cartoon": {
    id: "newspaper-cartoon",
    name: "신문 만평",
    description: "흑백 신문 만평/캐리커처. 굵은 잉크선 + 해칭/할프톤. 경제·심리·시사 풍자.",
    imagePrompt: {
      template:
        "black-and-white newspaper editorial cartoon and political caricature, {subject}, bold confident ink linework, cross-hatching and halftone dot shading, slightly exaggerated caricature figures, satirical tone, off-white newsprint background, minimal text — only a short keyword label or one small speech bubble (no paragraphs). Distinct elements with generous spacing and strong clear outlines so they can be drawn one by one.",
      negative: "color photo, 3d, neon, smooth gradient, glossy, dense text, paragraphs, cluttered",
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
    palette: { ink: "#1A1A1A", accent: "#C0392B", paper: "#F5F1E8" },
    userSliders: { lineWeight: { min: 0, max: 1, default: 0.6 } },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 10,
  },

  "comic-essay": {
    id: "comic-essay",
    name: "만화책",
    description: "만화/웹툰 에세이체. 깔끔한 선화 + 부드러운 색. 이야기로 기억에 남김.",
    imagePrompt: {
      template:
        "Korean comic essay / webtoon style illustration, {subject}, clean line art with soft flat colors and light cell shading, relatable simple characters, hand-drawn speech bubbles, warm friendly storytelling tone. ONE clear single illustration (not a multi-panel grid), light background, minimal text — only short keyword labels or a brief bubble (no paragraphs). Distinct elements with generous spacing and crisp outlines so they can be drawn one by one.",
      negative: "multi-panel grid, comic page layout, photorealistic, 3d, neon, dense text, paragraphs, cluttered",
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
    palette: { ink: "#2A2A2E", accent: "#E08A3C", paper: "#FFFDF8" },
    userSliders: { lineWeight: { min: 0, max: 1, default: 0.45 } },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 11,
  },

  collage: {
    id: "collage",
    name: "콜라주 (테리 길리엄)",
    description: "잡지·신문·명화 오려붙인 콜라주. 빈티지·풍자, 시선을 사로잡는 연출.",
    imagePrompt: {
      template:
        "Terry Gilliam-style cutout collage, {subject}, vintage magazine, newspaper and old-painting cutouts arranged as a quirky surreal composition, torn paper edges, aged sepia and muted tones, pointing hands and odd juxtapositions, satirical mood, minimal text — only short keyword labels (no paragraphs). Distinct cutout elements with generous spacing and visible edges so they can be revealed one by one.",
      negative: "smooth digital illustration, single clean photo, 3d render, neon, glossy, dense text, paragraphs",
      model: "gpt-image-2",
      quality: "medium",
      size: "1024x1536",
    },
    textStrategy: "hybrid",
    fontTitle: "Pretendard",
    fontLabel: "Pretendard",
    overlays: [{ type: "texture", asset: "hanji.png", opacity: 0.1 }],
    plannerDefaults: {
      revealStyle: "symbol-first",
      strokeStyle: "outline",
      flowDirection: "left-to-right",
      rhythm: "slow-breath",
      handTool: "marker",
    },
    palette: { ink: "#3A2E26", accent: "#A6432E", paper: "#EDE3CE" },
    userSliders: { colorTemperature: { min: -1, max: 1, default: 0.2 } },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 12,
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

  "drone-light": {
    id: "drone-light",
    name: "드론 라이트쇼",
    description: "밤하늘에 드론 빛점이 모여 형상을 빚어내는 연출. 리빌이 '빛이 모이는' 느낌.",
    imagePrompt: {
      template:
        "night-sky drone light show, {subject}, the subject formed entirely by thousands of tiny glowing drone light points (dot-matrix of luminous dots), bright bokeh dots in cyan, warm gold, magenta and white against a deep dark night sky, soft glow and sparkle, the dotted shapes clearly outlined. Distinct elements with generous dark spacing between them so each can light up one by one. No solid fills — everything made of separated points of light.",
      negative: "photorealistic continuous surfaces, daylight, white background, paper texture, solid flat fills, dense overlapping, paragraphs of text",
      model: "gpt-image-2",
      quality: "medium",
      size: "1024x1536",
    },
    textStrategy: "in-image",
    fontTitle: "Pretendard",
    fontLabel: "Pretendard",
    overlays: [],
    plannerDefaults: {
      revealStyle: "center-out",
      strokeStyle: "fill",
      flowDirection: "center-out",
      rhythm: "slow-breath",
      handTool: "pen",
    },
    palette: { ink: "#7DD3FC", accent: "#F0ABFC", paper: "#07060F" },
    userSliders: { lineWeight: { min: 0, max: 1, default: 0.5 } },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 13,
  },

  "graphic-novel": {
    id: "graphic-novel",
    name: "그래픽노블",
    description: "다큐 그래픽노블 선화. 굵은 잉크 라인 + 해칭, 흰 배경에 소재 중심. 역사·인류·교양.",
    imagePrompt: {
      template:
        "graphic novel ink illustration, {subject}, drawn with bold confident black ink outlines and selective cross-hatching, semi-realistic expressive figures, on a CLEAN WHITE background — subject-focused with NO detailed scenery (at most a few suggestive bold lines for context), generous white space. Muted naturalistic accent color kept minimal, mostly line art. Distinct elements with crisp clear outlines and spacing so a pen can draw them one by one.",
      negative: "full detailed background, dense scenery, architecture or landscape filling the frame, photograph, photorealistic, 3d render, busy texture, heavy color fill, chibi, kawaii, neon, multi-panel grid, dense text, paragraphs",
      model: "gpt-image-2",
      quality: "medium",
      size: "1024x1536",
    },
    textStrategy: "hybrid",
    fontTitle: "Pretendard",
    fontLabel: "Pretendard",
    overlays: [],
    plannerDefaults: {
      // 흰 배경 + 굵은 선화 → 펜이 윤곽을 따라 그리는 판서 리빌.
      revealStyle: "left-to-right",
      strokeStyle: "outline",
      flowDirection: "left-to-right",
      rhythm: "fast-beat",
      handTool: "pen",
    },
    palette: { ink: "#2B2620", accent: "#A0573B", paper: "#EDE7DB" },
    userSliders: { colorTemperature: { min: -1, max: 1, default: 0.1 } },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 14,
  },

  "cinematic-hype": {
    id: "cinematic-hype",
    name: "시네마틱 하이프",
    description: "보라·청색 네온 글로우 시네마틱 3D 디지털아트. 스포츠·재테크·동기부여 후킹용. (드로잉 리빌보다 페이드 연출에 가까움 — 노출 전 검토)",
    imagePrompt: {
      template:
        "cinematic dramatic 3D digital art illustration, {subject}, glowing neon holographic elements in electric blue, purple and magenta, volumetric god-rays and lighting, dark moody atmospheric background with bokeh and particles, futuristic high-energy hype aesthetic, high contrast, epic motivational cinematic mood, polished render. One bold focal subject.",
      negative: "flat line drawing, whiteboard, pencil sketch, hand-drawn doodle, paper texture, muted pastel, daylight, plain white background, dense text, paragraphs, multi-panel",
      model: "gpt-image-2",
      quality: "medium",
      size: "1024x1536",
    },
    textStrategy: "overlay",
    fontTitle: "Pretendard",
    fontLabel: "Pretendard",
    overlays: [],
    plannerDefaults: {
      revealStyle: "center-out",
      strokeStyle: "fill",
      flowDirection: "center-out",
      rhythm: "slow-breath",
      handTool: "pen",
    },
    palette: { ink: "#A78BFA", accent: "#22D3EE", paper: "#0A0816" },
    userSliders: { colorVibrancy: { min: 0, max: 1, default: 0.7 } },
    enabled: false, // 정의만, 기본 숨김 — 어드민 화풍 관리에서 노출 토글
    thumbnailUrls: [],
    sortOrder: 15,
  },

  "euro-graphic-novel": {
    id: "euro-graphic-novel",
    name: "유럽 그래픽노블",
    description: "유럽 BD(리뉴클레르) 선화. 깔끔한 굵은 잉크선, 흰 배경에 인물 중심. 인물·여행·역사.",
    imagePrompt: {
      template:
        "European graphic novel / bande dessinée (ligne claire) illustration, {subject}, clean confident bold ink linework, semi-realistic expressive characters, on a CLEAN WHITE background — character/subject focused with minimal background (only a few light bold lines to hint at setting, NO detailed architecture or full scenery), generous white space, restrained accent color, mostly line art. Crisp clear outlines and spacing so each element can be drawn one by one.",
      negative: "detailed European architecture background, full scene, dense scenery filling frame, photograph, 3d render, heavy color fill, chibi, kawaii, neon, manga screentone, dense text, paragraphs, multi-panel grid",
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
    palette: { ink: "#2A2622", accent: "#8C5A3C", paper: "#EFE9DC" },
    userSliders: { colorTemperature: { min: -1, max: 1, default: 0.05 } },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 16,
  },

  "pop-art": {
    id: "pop-art",
    name: "팝아트",
    description: "로이 리히텐슈타인식 팝아트. 굵은 외곽선 + 벤데이 도트 + 강렬한 원색. 시선강탈 후킹.",
    imagePrompt: {
      template:
        "Roy Lichtenstein-style pop art comic illustration, {subject}, bold thick black outlines, Ben-Day halftone dot shading, flat bright primary colors (red, yellow, blue, white), high contrast retro 1960s comic-book pop aesthetic, energetic and eye-catching. Picture-driven, minimal text — at most a short bold keyword (no paragraphs). Distinct elements with clear outlines so they can be drawn one by one.",
      negative: "muted desaturated colors, realistic soft shading, gradient, 3d render, photograph, pastel, sepia, dense text, paragraphs",
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
    palette: { ink: "#111111", accent: "#E4002B", paper: "#FFE600" },
    userSliders: { colorVibrancy: { min: 0, max: 1, default: 0.85 } },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 17,
  },

  webtoon: {
    id: "webtoon",
    name: "웹툰",
    description: "네이버웹툰풍 작화. 깔끔한 굵은 선 + 가벼운 셀셰이딩, 흰 배경에 인물 중심. 인물·드라마·일상.",
    imagePrompt: {
      template:
        "Korean webtoon (Naver webtoon) style illustration, {subject}, clean crisp digital line art with bold clear outlines, light soft cell shading, attractive expressive characters, on a CLEAN WHITE background — character/subject focused with NO busy background (at most a few simple bold lines), generous white space, vivid but restrained coloring. ONE clear single illustration (not a multi-panel grid). Distinct elements with clear outlines so they can be drawn one by one.",
      negative: "busy detailed background, full scene, dense scenery, photograph, 3d render, halftone dots, muted sepia, multi-panel comic grid, dense text, paragraphs",
      model: "gpt-image-2",
      quality: "medium",
      size: "1024x1536",
    },
    textStrategy: "overlay",
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
    palette: { ink: "#2A2A33", accent: "#5B8DEF", paper: "#FFFDFB" },
    userSliders: { lineWeight: { min: 0, max: 1, default: 0.45 } },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 18,
  },

  "explainer-doodle": {
    id: "explainer-doodle",
    name: "설명형 컬러두들",
    description: "미국식 프리미엄 설명영상(Golpo풍) — 굵은 마커선 + 밝은 컬러 + 형광펜 강조 + 박스·화살표. 교양·강의·지식 최적.",
    imagePrompt: {
      template:
        "modern explainer doodle infographic in the polished style of premium American educational videos, {subject}, bold confident hand-drawn black marker outlines with bright flat color fills, simple friendly characters and clear concept icons, arrows and rounded callout boxes connecting ideas, a few key words emphasized with highlighter accents (yellow highlight, red underline or circle), clean light cream/white background, generous whitespace, cheerful and approachable yet credible. Picture-driven with only short keyword labels (no sentences, no paragraphs, no dense text). Distinct elements clearly separated with crisp outlines so they can be drawn one by one.",
      negative: "photorealistic, 3d render, watercolor, ink wash, dark background, smooth gradient, heavy shading, dense paragraphs, walls of text, cluttered, small unreadable text, realistic proportions, manga, anime",
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
    palette: { ink: "#1A1A1A", accent: "#F59E0B", paper: "#FFFDF6" },
    userSliders: { lineWeight: { min: 0, max: 1, default: 0.7 } },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 19,
  },

  "mono-line": {
    id: "mono-line",
    name: "모노 라인",
    description: "가는 단색 라인 일러스트 + 아이콘·라벨. 깔끔·편집디자인 톤. 구조·시스템·개요 설명에 적합.",
    imagePrompt: {
      template:
        "clean monochrome line-art infographic illustration, {subject}, fine even single-color (black or dark grey) linework on a white background, precise minimal vector-like lines, small labeled icons connected with thin lines and arrows, elegant editorial and calm, NO color fills (line only, no shading), generous whitespace. Only short keyword labels (no paragraphs). Distinct elements with clear thin outlines so they can be drawn one by one.",
      negative: "color fills, bright colors, heavy marker, halftone, 3d render, photorealistic, watercolor, dark background, dense text, paragraphs, cluttered, heavy cross-hatching, shadows",
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
    palette: { ink: "#2A2A2E", accent: "#555555", paper: "#FFFFFF" },
    userSliders: { lineWeight: { min: 0, max: 1, default: 0.35 } },
    enabled: true,
    thumbnailUrls: [],
    sortOrder: 20,
  },
};

/** id → 생성 화면 표시용 이모지 (관리/선택 UI 공용). */
export const STYLE_EMOJI: Record<string, string> = {
  whiteboard: "✏️", "doodle-edu": "🖊️", "ink-wash": "🖌️", "joseon-reaper": "👻",
  "flat-icon": "🟦", "retro-poster": "📻", "dark-neon": "🌃", "3d-iso": "🧊",
  "newspaper-cartoon": "🗞️", "comic-essay": "💬", collage: "✂️", minhwa: "🐯",
  "drone-light": "✨", "graphic-novel": "📖", "cinematic-hype": "🎬",
  "euro-graphic-novel": "🏛️", "pop-art": "💥", webtoon: "📱",
  "explainer-doodle": "🖍️", "mono-line": "✒️",
};

/** 화풍 카탈로그(정렬). create/admin 등 모든 화풍 선택 UI의 공용 단일 출처. */
export const STYLE_CATALOG = Object.values(STYLE_PACKS)
  .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
  .map((p) => ({ id: p.id, name: p.name, desc: p.description, emoji: STYLE_EMOJI[p.id] ?? "🎨", enabled: p.enabled !== false }));

export function getStylePack(id: string): StylePackDoc {
  return STYLE_PACKS[id] ?? STYLE_PACKS.whiteboard;
}

/**
 * en 영상일 때만 화풍 템플릿에서 "한글 라벨을 유도하는 맥락어"를 중화한다.
 *
 * 보존 원칙(부작용 방지): 화풍을 정의하는 한국 미술 용어(korean ink wash, Korean folk
 * painting/minhwa, Korean webtoon, Korean ink-and-brush 등)는 그대로 둔다 — 그건 사용자가
 * 고른 그림체 정체성이라 지우면 스타일이 깨진다. 제거 대상은 그림체와 무관한 두 가지뿐:
 *   (1) 청중/맥락 표지("Korean educational YouTube") — 한국 유튜브 맥락이 한글 글씨를 강하게 유도.
 *   (2) 프롬프트 안의 리터럴 한글(예: 저승사자) — en 이미지에 그대로 새겨질 위험.
 * ko는 원본 템플릿을 그대로 반환한다(영향 없음).
 */
export function localizeTemplate(template: string, locale: string): string {
  if (locale !== "en") return template;
  let t = template;
  // (1) 청중/맥락 표지만 중화 — "Korean"만 떼어내 그림체(whiteboard doodle 등)는 유지.
  t = t.replace(/Korean educational YouTube/gi, "educational");
  // (2) 프롬프트 내 리터럴 한글 → 로마자.
  t = t.replace(/저승사자/g, "Joseon-era grim reaper");
  // 안전망: 남은 단독 한글 블록 제거(향후 템플릿에 한글이 섞여도 en 이미지로 새지 않게).
  t = t.replace(/[가-힣]+/g, "").replace(/\(\s*:/g, "(").replace(/\s{2,}/g, " ");
  return t;
}

/**
 * 이미지(gpt-image-2) 안에 그려지는 글자·라벨의 "언어"를 contentLocale에 맞춰 못박는 지시.
 * 라벨 언어 통제의 단일 출처. ko/en 대칭 설계 — ko는 한글이, en은 영어가 또렷이 나오게 한다.
 *
 * 핵심: 라벨 자체를 막지 않는다(전면 금지 ✗). 필요한 라벨은 분명히 그리되 "언어"만 고정한다.
 * 배경: 한국 소개 등 영어권 영상에서 이미지에 한글이 섞여 나오던 문제 → 과거엔 en에서 텍스트를
 *       통째로 금지(NO TEXT)해 우회했으나, 그러면 영어 라벨까지 사라진다. 언어만 고정해 둘 다 해결.
 */
export function inImageTextDirective(locale: string): string {
  if (locale === "en") {
    return " CRITICAL — IN-IMAGE TEXT LANGUAGE: Every letter, word, label, sign, or caption rendered inside the image MUST be written in clear, correctly-spelled ENGLISH only. Do NOT render any Korean / Hangul characters or any non-Latin script anywhere in the image, even when the subject is about Korea — transliterate Korean names into the Latin alphabet (e.g. 'Hanbok', 'Seoul', 'Kimchi'). The ONLY exception is an exact brand or company name explicitly specified elsewhere in this prompt, which must be rendered exactly as written.";
  }
  // ko (기본)
  return " 매우 중요 — 이미지 속 글자 언어: 화면 안에 그려지는 모든 글자·라벨·간판·자막은 또렷하고 맞춤법에 맞는 한국어(한글)로 표기하라. 라벨이 필요한 곳에는 한글 라벨을 분명히 그려라. 영어·외국어 글자를 불필요하게 섞지 말 것(약어·고유명사·브랜드명 등 꼭 필요한 경우만 원문 그대로 허용).";
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
