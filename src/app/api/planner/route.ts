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

    // 전역 붓 크기 설정 (어드민 시스템설정)
    const settings = (await db.collection("settings").doc("global").get()).data() ?? {};
    const brushSize = (settings.brushSize as number) ?? 1;

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
      brushSize,
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
