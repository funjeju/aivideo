import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeRequest, ownsProject, internalHeaders } from "@/lib/auth";
import { isBillingEnabled } from "@/lib/billing";

// Vercel(Pro/fluid) 최대 실행 시간 — 이미지 N장 생성이 길어 기본 한도를 넘김
export const maxDuration = 800;

/** 내부 호출 + 타임아웃 + 재시도 (응답 없는 외부 API로 인한 영구 행/누락 방지) */
async function fetchWithTimeout(url: string, body: object, ms: number, retries = 1): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: internalHeaders(),
        signal: AbortSignal.timeout(ms),
        body: JSON.stringify(body),
      });
      if (res.ok) return res;
    } catch {
      // 타임아웃/네트워크 — 재시도
    }
  }
  return null;
}

/**
 * 승인 후 이미지→Vision→Planner 파이프라인 오케스트레이션.
 * 각 장면 병렬 처리. 이미 완료된 장면은 건너뛰어(멱등) 멈춘 지점부터 재개 가능.
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

    // 병렬 처리. 이미지 생성은 OpenAI 응답 대기(네트워크 바운드)라 동시성을 올리면
    // 거의 비례해 빨라진다. Tier 1 안전 스윗스팟 = 4 (버스트가 RPM 한도 안쪽,
    // 간헐 429는 images 라우트의 SDK 백오프가 흡수). 더 빠르게 = Tier 2 업그레이드.
    const BATCH = 4;
    for (let i = 0; i < scenes.length; i += BATCH) {
      // 취소 요청 확인 (배치 사이마다) — 클라가 cancelRequested를 켜면 즉시 중단
      const cur = (await db.collection("projects").doc(projectId).get()).data();
      if (cur?.cancelRequested) {
        await db.collection("projects").doc(projectId).update({
          status: "script_ready",
          cancelRequested: false,
          generateProgress: 0,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return NextResponse.json({ ok: true, cancelled: true });
      }
      const batch = scenes.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (scene: Record<string, unknown>) => {
          try {
            const sceneId = scene.id as string;
            const sceneRef = db.collection("projects").doc(projectId).collection("scenes").doc(sceneId);

            // 멱등: 이미 sceneSpec(planner)까지 완성된 장면은 건너뜀
            const cur = (await sceneRef.get()).data() ?? {};
            const alreadyDone = !!cur.imageUrl && !!cur.sceneSpec?.reveal;
            if (alreadyDone) {
              done++;
              await db.collection("projects").doc(projectId).update({
                generateProgress: Math.round((done / total) * 100),
                updatedAt: FieldValue.serverTimestamp(),
              });
              return;
            }

            // Step 4: 이미지 생성 (이미 있으면 스킵, 이미지당 최대 180초)
            let imageUrl = cur.imageUrl as string | undefined;
            if (!imageUrl) {
              const imgRes = await fetchWithTimeout(`${origin}/api/images`, {
                projectId, sceneId, visualIntent: scene.visualIntent, stylePackId: project.stylePackId,
              }, 180000);
              if (imgRes?.ok) {
                const imgData = await imgRes.json();
                imageCount++;
                imageCostUsd += imgData.cost ?? 0;
                imageRegenerations += imgData.regenerations ?? 0;
              }
              imageUrl = (await sceneRef.get()).data()?.imageUrl;
            }

            if (imageUrl) {
              // Step 5: Vision (의미 매칭, 최대 90초, 1회 재시도) → Step 6: Planner
              const vRes = await fetchWithTimeout(`${origin}/api/vision`, { projectId, sceneId, imageUrl, narration: scene.narration }, 90000, 1);
              if (!vRes) console.error(`vision failed for scene ${sceneId}`);
              await fetchWithTimeout(`${origin}/api/planner`, { projectId, sceneId }, 60000, 1);
            }
          } catch (e) {
            console.error(`Scene ${scene.id} failed:`, e);
          }

          done++;
          await db.collection("projects").doc(projectId).update({
            generateProgress: Math.round((done / total) * 100),
            updatedAt: FieldValue.serverTimestamp(),
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

    // 크레딧 차감 (토글 ON & 비면제 계정만). 실비 = 이번 생성의 외부 API 원가.
    try {
      const ownerId = project.ownerId as string;
      const userRef = db.collection("users").doc(ownerId);
      const userData = (await userRef.get()).data();
      const exempt = userData?.billingExempt === true;
      if ((await isBillingEnabled()) && !exempt) {
        const projData = (await db.collection("projects").doc(projectId).get()).data();
        const c = projData?.costLog ?? {};
        const spent = (c.imageCostUsd ?? 0) + (c.llmCostUsd ?? 0) + (c.ttsCostUsd ?? 0);
        if (spent > 0) {
          await userRef.update({ credits: FieldValue.increment(-spent) });
        }
      }
    } catch (e) {
      console.error("credit deduction failed:", e);
    }

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
