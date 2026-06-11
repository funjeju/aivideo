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
}

export function buildSceneSpec(input: PlannerInput): SceneSpec {
  const { sceneId, order, narration, durationSec, audioUrl, imageUrl, objects, stylePack, aspect } = input;
  const defaults = stylePack.plannerDefaults;

  // Reveal Planner: title/label 먼저, illustration 나중
  const roleOrder: Record<string, number> = { title: 1, label: 2, arrow: 3, shape: 4, illustration: 5 };
  const sorted = [...objects].sort((a, b) => (roleOrder[a.role] ?? 5) - (roleOrder[b.role] ?? 5));

  // Sync Planner: durationSec 기준으로 startAt/endAt 배분
  const totalObjects = sorted.length || 1;
  const revealObjects: RevealObject[] = sorted.map((obj, i) => {
    const slotDuration = durationSec / totalObjects;
    const startAt = parseFloat((i * slotDuration * 0.8).toFixed(2));
    const endAt = parseFloat((startAt + slotDuration * 0.9).toFixed(2));

    return {
      ...obj,
      revealOrder: i + 1,
      strokeStyle: defaults.strokeStyle as RevealObject["strokeStyle"],
      flowDirection: defaults.flowDirection,
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
    hand: { enabled: true, asset: defaults.handTool },
  };
}
