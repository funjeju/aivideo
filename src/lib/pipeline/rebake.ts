import { getStylePack } from "@/lib/style-packs";
import { buildSceneSpec } from "@/lib/pipeline/planner";
import { RevealObject, SceneSpec } from "@/lib/types";

/**
 * 현재 저장된 붓 프리셋(settings/global.presets[style])을 프로젝트의 모든 장면
 * sceneSpec.hand에 다시 굽는다(re-bake). sceneSpec은 generate 때 1회 동결되므로,
 * 붓테스트에서 값을 바꿔 저장해도 그냥은 반영되지 않는 문제를 해결한다.
 *
 * - 외부 API 호출 0(buildSceneSpec은 순수 계산) → 비용 0, 수십 ms.
 * - vision 결과(reveal.objects)는 그대로 재사용 → 멱등.
 * - diff 가드: hand/flowMode가 실제로 바뀐 장면만 기록 → 불필요한 쓰기/세그먼트 캐시 무효화 방지.
 *
 * 미리보기(클라 캔버스)와 렌더(워커)가 모두 같은 sceneSpec을 읽으므로, 이 한 번의 갱신으로
 * 둘 다 최신 붓을 본다.
 *
 * @returns 갱신된(바뀐) 장면 수
 */
export async function rebakeBrushPresets(
  db: FirebaseFirestore.Firestore,
  projectId: string,
  project: FirebaseFirestore.DocumentData
): Promise<number> {
  const stylePack = getStylePack(project.stylePackId ?? "whiteboard");
  const aspect = (project.aspect ?? "9:16") as "9:16" | "16:9" | "1:1";

  const settings = (await db.collection("settings").doc("global").get()).data() ?? {};
  const presets = (settings.presets ?? {}) as Record<string, Record<string, unknown>>;
  const p = presets[stylePack.id] ?? {};
  const pick = <T>(key: string, def: T): T => (p[key] ?? settings[key] ?? def) as T;

  const scenesSnap = await db.collection("projects").doc(projectId).collection("scenes").orderBy("order").get();
  const batch = db.batch();
  let touched = 0;

  // 같은 prop이면 결과는 결정적 → 변화 감지는 hand+flowMode 직렬화 비교로 충분.
  const sig = (s?: Partial<SceneSpec>) => JSON.stringify([s?.hand ?? null, s?.flowMode ?? null]);

  for (const docSnap of scenesSnap.docs) {
    const scene = docSnap.data();
    const objects: RevealObject[] = scene.sceneSpec?.reveal?.objects ?? [];
    // 아직 vision/planner 안 된 장면은 굽을 게 없음.
    if (!scene.sceneSpec?.reveal || objects.length === 0) continue;

    const next = buildSceneSpec({
      sceneId: docSnap.id,
      order: scene.order,
      narration: scene.narration ?? "",
      durationSec: scene.durationSec ?? 5,
      audioUrl: scene.audioUrl ?? "",
      imageUrl: scene.imageUrl ?? "",
      objects,
      stylePack,
      aspect,
      brushSize: pick("brushSize", 1),
      brushCount: pick("brushCount", 1),
      brushSpeed: pick("brushSpeed", 1),
      brushType: pick("brushType", undefined),
      handAsset: pick("handAsset", undefined),
      flowMode: pick("flowMode", undefined),
      inkSpread: pick("inkSpread", 0.5),
      fillRange: pick("fillRange", 1),
      subtitles: (settings.subtitles ?? true) !== false,
      showBrush: project.showBrush !== false,
    });

    // 붓/흐름이 안 바뀐 장면은 건너뜀(세그먼트 캐시 유지).
    if (sig(scene.sceneSpec as SceneSpec) === sig(next)) continue;

    batch.update(docSnap.ref, { sceneSpec: next });
    touched++;
  }

  if (touched > 0) await batch.commit();
  return touched;
}
