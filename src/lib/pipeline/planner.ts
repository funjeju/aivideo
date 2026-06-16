import { RevealObject, SceneSpec, StylePackDoc, BrushType } from "@/lib/types";

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
  brushType?: BrushType;
  /** ""/undefined = 스타일팩 기본 도구 */
  handAsset?: string;
  /** sync(나레이션 anchor 동기) | topdown(위→아래 순차) */
  flowMode?: "sync" | "topdown";
}

export function buildSceneSpec(input: PlannerInput): SceneSpec {
  const { sceneId, order, narration, durationSec, audioUrl, imageUrl, objects, stylePack, aspect, brushSize, brushCount, brushSpeed, brushType, handAsset, flowMode } = input;
  const defaults = stylePack.plannerDefaults;

  // Reveal Planner: revealOrder가 이미 지정돼 있으면(=LLM 의미 매칭) 그 순서, 없으면 role 순서
  const roleOrder: Record<string, number> = { title: 1, label: 2, arrow: 3, shape: 4, illustration: 5 };
  const hasSemanticOrder = objects.some((o) => typeof o.revealOrder === "number");
  const sorted = [...objects].sort((a, b) => {
    if (hasSemanticOrder) return (a.revealOrder ?? 99) - (b.revealOrder ?? 99);
    return (roleOrder[a.role] ?? 5) - (roleOrder[b.role] ?? 5);
  });

  const DRAW_WINDOW = durationSec * 0.85;

  // 위→아래 모드: anchor 무시, 화면 상단부터 순차 완성 (균등 슬롯, 겹침 최소)
  if (flowMode === "topdown") {
    const byY = [...objects].sort((a, b) => (a.bbox[1] - b.bbox[1]) || (a.bbox[0] - b.bbox[0]));
    const slot = DRAW_WINDOW / Math.max(byY.length, 1);
    const tdObjects: RevealObject[] = byY.map((obj, i) => ({
      ...obj,
      revealOrder: i + 1,
      strokeStyle: (obj.strokeStyle ?? defaults.strokeStyle) as RevealObject["strokeStyle"],
      flowDirection: obj.flowDirection ?? defaults.flowDirection,
      startAt: parseFloat((i * slot).toFixed(2)),
      endAt: parseFloat(Math.min(i * slot + slot * 1.15, durationSec).toFixed(2)),
    }));
    return {
      sceneId, order, durationSec, narration, audioUrl,
      canvas: { aspect, background: stylePack.id === "whiteboard" ? "white" : "paper-hanji" },
      image: { url: imageUrl, fit: "contain" },
      reveal: { objects: tdObjects },
      overlays: stylePack.overlays.map((o) => ({ ...o })),
      hand: { enabled: true, asset: handAsset || defaults.handTool, size: brushSize ?? 1, count: brushCount ?? 1, speed: brushSpeed ?? 1, brushType: brushType ?? "round" },
    };
  }

  // Sync Planner: 나레이션-시각 시간 동기화.
  // anchorText(나레이션 구절)가 발화되는 시점에 객체를 그리기 시작한다.
  // 나레이션은 글자수에 비례해 균일 속도로 읽힌다고 보고, anchor 위치 비율 × durationSec = startAt.

  // anchorText를 나레이션에서 찾아 위치 비율(0~1)을 구한다.
  // Vision이 구절을 정확히 복사하지 않는 경우가 많아(조사 변형·띄어쓰기·잘림: "손실을"→"손해를" 등)
  // 정규화 + 앞/뒤 부분일치로 강건하게 매칭한다. 실패 시 -1.
  const norm = (s: string) => s.replace(/\s+/g, "").replace(/["'.,!?…·]/g, "");
  const nNarr = norm(narration);
  function anchorRatio(anchorText?: string): number {
    const a = norm(anchorText ?? "");
    if (!a || nNarr.length === 0) return -1;
    let idx = nNarr.indexOf(a);
    if (idx >= 0) return idx / nNarr.length;
    // 부분 일치: 앞/뒤에서 점점 짧게 잘라 재시도 (최소 4자)
    for (let len = Math.min(a.length, 12); len >= 4; len--) {
      idx = nNarr.indexOf(a.slice(0, len));
      if (idx >= 0) return idx / nNarr.length;
      idx = nNarr.indexOf(a.slice(a.length - len));
      if (idx >= 0) return idx / nNarr.length;
    }
    return -1;
  }

  // 객체별 앵커 시각 (매칭 실패 시 순서 기반 균등 폴백)
  const n = Math.max(sorted.length, 1);
  const withAnchor = sorted.map((obj, i) => {
    const r = anchorRatio(obj.anchorText);
    return { obj, anchor: (r >= 0 ? r : i / n) * DRAW_WINDOW };
  });

  // 발화 시각 순 정렬 + 같은 지점에 몰리지 않게 최소 간격 확보
  // (Vision이 여러 객체에 같은 구절을 달면 0초에 겹쳐 "한꺼번에" 그려지는 문제 방지)
  withAnchor.sort((x, y) => x.anchor - y.anchor || ((x.obj.revealOrder ?? 0) - (y.obj.revealOrder ?? 0)));
  const minGap = (DRAW_WINDOW / n) * 0.6;
  for (let i = 1; i < withAnchor.length; i++) {
    if (withAnchor[i].anchor < withAnchor[i - 1].anchor + minGap) {
      withAnchor[i].anchor = withAnchor[i - 1].anchor + minGap;
    }
  }

  const revealObjects: RevealObject[] = withAnchor.map(({ obj, anchor }, i) => {
    // 첫 객체는 나레이션 시작과 동시에 붓 출발 (anchor가 늦어도 0초 시작)
    const startAt = i === 0 ? 0 : parseFloat(Math.min(anchor, DRAW_WINDOW).toFixed(2));
    const nextStart = i + 1 < withAnchor.length ? withAnchor[i + 1].anchor : DRAW_WINDOW;
    const endAt = parseFloat(Math.min(Math.max(nextStart + 0.4, startAt + 0.6), durationSec).toFixed(2));
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
    hand: { enabled: true, asset: handAsset || defaults.handTool, size: brushSize ?? 1, count: brushCount ?? 1, speed: brushSpeed ?? 1, brushType: brushType ?? "round" },
  };
}
