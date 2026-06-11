import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getStylePack } from "@/lib/style-packs";
import { buildSceneSpec } from "@/lib/pipeline/planner";
import { RevealObject } from "@/lib/types";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const { projectId, sceneId } = await req.json();
    if (!projectId || !sceneId) {
      return NextResponse.json({ error: "projectId, sceneId required" }, { status: 400 });
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

    // aspect: targetLength에 따라 9:16 기본
    const aspect = "9:16" as const;

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
