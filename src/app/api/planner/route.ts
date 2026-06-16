import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getStylePack } from "@/lib/style-packs";
import { buildSceneSpec } from "@/lib/pipeline/planner";
import { RevealObject } from "@/lib/types";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeRequest, ownsProject } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeRequest(req);
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { projectId, sceneId } = await req.json();
    if (!projectId || !sceneId) {
      return NextResponse.json({ error: "projectId, sceneId required" }, { status: 400 });
    }
    if (!(await ownsProject(auth, projectId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const db = adminDb();
    const projectSnap = await db.collection("projects").doc(projectId).get();
    const sceneSnap = await db.collection("projects").doc(projectId).collection("scenes").doc(sceneId).get();

    if (!projectSnap.exists || !sceneSnap.exists) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const project = projectSnap.data()!;
    const scene = sceneSnap.data()!;
    const stylePack = getStylePack(project.stylePackId ?? "whiteboard");
    const objects: RevealObject[] = scene.sceneSpec?.reveal?.objects ?? [];

    const aspect = (project.aspect ?? "9:16") as "9:16" | "16:9" | "1:1";

    // 붓 설정: 화풍 프리셋 값 우선 → 전역 → 기본값
    const settings = (await db.collection("settings").doc("global").get()).data() ?? {};
    const presets = (settings.presets ?? {}) as Record<string, Record<string, unknown>>;
    const p = presets[stylePack.id] ?? {};
    const pick = <T>(key: string, def: T): T => (p[key] ?? settings[key] ?? def) as T;

    const sceneSpec = buildSceneSpec({
      sceneId,
      order: scene.order,
      narration: scene.narration,
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
    });

    await db.collection("projects").doc(projectId).collection("scenes").doc(sceneId).update({
      sceneSpec,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ sceneSpec });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "planner failed" }, { status: 500 });
  }
}
