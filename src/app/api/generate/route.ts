import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeRequest, ownsProject, internalHeaders } from "@/lib/auth";

/**
 * 승인 후 이미지→Vision→Planner 파이프라인 오케스트레이션.
 * 각 장면을 병렬로 처리하고 progress를 Firestore에 기록.
 */
export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { projectId } = await req.json();
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  if (!(await ownsProject(auth, projectId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const origin = req.nextUrl.origin;
  const db = adminDb();

  try {
    // 상태 → generating
    await db.collection("projects").doc(projectId).update({
      status: "generating",
      updatedAt: FieldValue.serverTimestamp(),
    });

    const projectSnap = await db.collection("projects").doc(projectId).get();
    const project = projectSnap.data()!;

    const scenesSnap = await db
      .collection("projects").doc(projectId)
      .collection("scenes")
      .orderBy("order")
      .get();

    const scenes = scenesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const total = scenes.length;
    let done = 0;

    // 비용 집계 (CORE 원칙 5: 영상 1편의 외부 API 원가 추적)
    let imageCount = 0;
    let imageCostUsd = 0;
    let imageRegenerations = 0;

    // 병렬 처리 (최대 4개 동시)
    const BATCH = 4;
    for (let i = 0; i < scenes.length; i += BATCH) {
      const batch = scenes.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (scene: Record<string, unknown>) => {
          try {
            // Step 4: 이미지 생성
            const imgRes = await fetch(`${origin}/api/images`, {
              method: "POST",
              headers: internalHeaders(),
              body: JSON.stringify({
                projectId,
                sceneId: scene.id,
                visualIntent: scene.visualIntent,
                stylePackId: project.stylePackId,
              }),
            });
            if (imgRes.ok) {
              const imgData = await imgRes.json();
              imageCount++;
              imageCostUsd += imgData.cost ?? 0;
              imageRegenerations += imgData.regenerations ?? 0;
            }

            // 이미지 URL 다시 읽기
            const sceneSnap = await db
              .collection("projects").doc(projectId)
              .collection("scenes").doc(scene.id as string)
              .get();
            const imageUrl = sceneSnap.data()?.imageUrl;

            if (imageUrl) {
              // Step 5: Vision 분석
              await fetch(`${origin}/api/vision`, {
                method: "POST",
                headers: internalHeaders(),
                body: JSON.stringify({ projectId, sceneId: scene.id, imageUrl }),
              });

              // Step 6: Planner
              await fetch(`${origin}/api/planner`, {
                method: "POST",
                headers: internalHeaders(),
                body: JSON.stringify({ projectId, sceneId: scene.id }),
              });
            }
          } catch (e) {
            console.error(`Scene ${scene.id} failed:`, e);
          }

          done++;
          // 진행률 업데이트 (renderJobs가 없으므로 project에 임시 저장)
          await db.collection("projects").doc(projectId).update({
            generateProgress: Math.round((done / total) * 100),
          });
        })
      );
    }

    // 완료 → done + 이미지 비용 적재
    await db.collection("projects").doc(projectId).update({
      status: "done",
      generateProgress: 100,
      "costLog.imageCount": imageCount,
      "costLog.imageCostUsd": Math.round(imageCostUsd * 10000) / 10000,
      "costLog.imageRegenerations": imageRegenerations,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, total });
  } catch (e) {
    console.error(e);
    await db.collection("projects").doc(projectId).update({
      status: "error",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ error: "generate pipeline failed" }, { status: 500 });
  }
}
