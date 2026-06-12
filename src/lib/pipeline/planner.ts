import { RevealObject, SceneSpec, StylePackDoc } from "@/lib/types";

interface PlannerInput {
  sceneId: string;
  order: number;
  narration: string;
  durationSec: number;
  audioUrl: string;
  imageUrl: string;
  objects: RevealObject[];
  stylePack: StylePackDoc;
  aspect: "9:16" | "16:9" | "1:1";
  brushSize?: number;
}

export function buildSceneSpec(input: PlannerInput): SceneSpec {
  const { sceneId, order, narration, durationSec, audioUrl, imageUrl, objects, stylePack, aspect, brushSize } = input;
  const defaults = stylePack.plannerDefaults;

  // Reveal Planner: revealOrder가 이미 지정돼 있으면(=LLM 의미 매칭) 그 순서, 없으면 role 순서
  const roleOrder: Record<string, number> = { title: 1, label: 2, arrow: 3, shape: 4, illustration: 5 };
  const hasSemanticOrder = objects.some((o) => typeof o.revealOrder === "number");
  const sorted = [...objects].sort((a, b) => {
    if (hasSemanticOrder) return (a.revealOrder ?? 99) - (b.revealOrder ?? 99);
    return (roleOrder[a.role] ?? 5) - (roleOrder[b.role] ?? 5);
  });

  // Sync Planner: 전체 객체를 durationSec의 앞 80% 안에 다 그리고, 마지막 20%는 완성본 유지.
  // 줄 단위 스트로크라 객체별 시간을 bbox 높이(작업량)에 비례 배분.
  const DRAW_WINDOW = durationSec * 0.8;
  const weights = sorted.map((o) => Math.max(0.4, (o.bbox[3] - o.bbox[1]) / 1536));
  const wSum = weights.reduce((s, w) => s + w, 0) || 1;

  let cursor = 0;
  const revealObjects: RevealObject[] = sorted.map((obj, i) => {
    const span = (weights[i] / wSum) * DRAW_WINDOW;
    const startAt = parseFloat(cursor.toFixed(2));
    // 다음 객체와 살짝 겹치도록 endAt은 span의 1.15배 (단 DRAW_WINDOW 초과 금지)
    const endAt = parseFloat(Math.min(cursor + span * 1.15, DRAW_WINDOW).toFixed(2));
    cursor += span;

    return {
      ...obj,
      revealOrder: i + 1,
      strokeStyle: (obj.strokeStyle ?? defaults.strokeStyle) as RevealObject["strokeStyle"],
      flowDirection: obj.flowDirection ?? defaults.flowDirection,
      startAt,
      endAt,
    };
  });

  return {
    sceneId,
    order,
    durationSec,
    narration,
    audioUrl,
    canvas: {
      aspect,
      background: stylePack.id === "whiteboard" ? "white" : "paper-hanji",
    },
    image: { url: imageUrl, fit: "contain" },
    reveal: { objects: revealObjects },
    overlays: stylePack.overlays.map((o) => ({ ...o })),
    hand: { enabled: true, asset: defaults.handTool, size: brushSize ?? 1 },
  };
}
