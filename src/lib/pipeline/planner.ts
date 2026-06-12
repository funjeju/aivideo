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
  brushCount?: number;
  brushSpeed?: number;
}

export function buildSceneSpec(input: PlannerInput): SceneSpec {
  const { sceneId, order, narration, durationSec, audioUrl, imageUrl, objects, stylePack, aspect, brushSize, brushCount, brushSpeed } = input;
  const defaults = stylePack.plannerDefaults;

  // Reveal Planner: revealOrder가 이미 지정돼 있으면(=LLM 의미 매칭) 그 순서, 없으면 role 순서
  const roleOrder: Record<string, number> = { title: 1, label: 2, arrow: 3, shape: 4, illustration: 5 };
  const hasSemanticOrder = objects.some((o) => typeof o.revealOrder === "number");
  const sorted = [...objects].sort((a, b) => {
    if (hasSemanticOrder) return (a.revealOrder ?? 99) - (b.revealOrder ?? 99);
    return (roleOrder[a.role] ?? 5) - (roleOrder[b.role] ?? 5);
  });

  // Sync Planner: 나레이션-시각 시간 동기화.
  // anchorText(나레이션 구절)가 발화되는 시점에 객체를 그리기 시작한다.
  // 나레이션은 글자수에 비례해 균일 속도로 읽힌다고 보고, anchor 위치 비율 × durationSec = startAt.
  const DRAW_WINDOW = durationSec * 0.85;
  const narrLen = Math.max(narration.length, 1);

  // 각 객체의 앵커 시각 계산 (anchorText를 나레이션에서 찾아 위치 비율)
  type Timed = RevealObject & { _anchor: number };
  const timed: Timed[] = sorted.map((obj, i) => {
    let anchor: number;
    const at = obj.anchorText?.trim();
    const idx = at ? narration.indexOf(at) : -1;
    if (idx >= 0) {
      anchor = (idx / narrLen) * DRAW_WINDOW;
    } else {
      // 앵커 못 찾으면 순서 기반 균등 폴백
      anchor = (i / Math.max(sorted.length, 1)) * DRAW_WINDOW;
    }
    return { ...obj, _anchor: anchor };
  });

  // 앵커 시각 순으로 정렬 (실제 발화 순서)
  timed.sort((a, b) => a._anchor - b._anchor);

  const revealObjects: RevealObject[] = timed.map((obj, i) => {
    const { _anchor, ...rest } = obj;
    // 첫 객체는 나레이션 시작과 동시에 붓이 출발 (anchor가 늦어도 0초 시작)
    const startAt = i === 0 ? 0 : parseFloat(Math.min(_anchor, DRAW_WINDOW).toFixed(2));
    // 그리기 종료 = 다음 객체 시작 시각(겹침 약간) 또는 DRAW_WINDOW
    const nextStart = i + 1 < timed.length ? timed[i + 1]._anchor : DRAW_WINDOW;
    const endAt = parseFloat(Math.min(Math.max(nextStart + 0.4, startAt + 0.6), durationSec).toFixed(2));
    return {
      ...rest,
      revealOrder: i + 1,
      strokeStyle: (rest.strokeStyle ?? defaults.strokeStyle) as RevealObject["strokeStyle"],
      flowDirection: rest.flowDirection ?? defaults.flowDirection,
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
    hand: { enabled: true, asset: defaults.handTool, size: brushSize ?? 1, count: brushCount ?? 1, speed: brushSpeed ?? 1 },
  };
}
