import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeRequest, ownsProject, internalHeaders } from "@/lib/auth";
import { refundCredits } from "@/lib/credits";
import { logEvent } from "@/lib/genlog";

// Vercel(Pro/fluid) 최대 실행 시간 — 이미지 N장 생성이 길어 기본 한도를 넘김
export const maxDuration = 800;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** 업소 실제 사진을 어울리는 장면에 배정(텍스트 매칭 1회). 반환: {sceneOrder: photoIndex} */
async function matchPhotosToScenes(
  scenes: { order: number; visualIntent?: string; narration?: string }[],
  photos: { label: string }[]
): Promise<Record<number, number>> {
  const sceneList = scenes.map((s) => `${s.order}: ${s.visualIntent || s.narration || ""}`).join("\n");
  const photoList = photos.map((p, i) => `${i}: ${p.label || "(라벨 없음)"}`).join("\n");
  const prompt = `업소(매장) 홍보 영상이다. 아래 "장면"과 "업소 실제 사진"을 보고, 사진을 그 사진이 실제로 보여주는 대상과 직접 일치하는 장면에만 배정하라.
중요 규칙:
- **사진 1장은 정확히 한 장면에만** 배정한다(같은 사진을 여러 장면에 쓰지 말 것).
- 대부분의 장면은 사진 없이 스토리에 맞춰 일반 생성된다. 사진은 **꼭 필요한 소수 장면(매장 외관/내부/메뉴/제품을 직접 보여주는 장면)에만** 쓰는 예외다.
- 명확히 들어맞는 장면이 없으면 **그 사진은 배정하지 마라(빈 배열 가능)**. 억지 배정 금지.
[장면 (번호: 설명)]
${sceneList}
[사진 (인덱스: 라벨)]
${photoList}
출력은 JSON만: {"assignments":[{"sceneOrder":번호,"photoIndex":번호}]}`;
  const c = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });
  const parsed = JSON.parse(c.choices[0].message.content || "{}");
  const out: Record<number, number> = {};
  for (const a of parsed.assignments || []) {
    if (typeof a.sceneOrder === "number" && typeof a.photoIndex === "number") out[a.sceneOrder] = a.photoIndex;
  }
  return out;
}

/** 캐릭터(인물) 참조가 있을 때, 사람이 자연스럽게 등장할 장면 order만 선별(LLM 1회). */
async function matchCharacterScenes(
  scenes: { order: number; visualIntent?: string; narration?: string }[]
): Promise<Set<number>> {
  const list = scenes.map((s) => `${s.order}: ${s.visualIntent || s.narration || ""}`).join("\n");
  const prompt = `이 영상에는 등장인물(주인공) 참조 이미지가 있다. 아래 장면들 중 **사람(인물)이 자연스럽게 등장할 장면의 order만** 골라라.
- 인물의 행동·감정·이야기가 담긴 장면 = 포함.
- 순수 다이어그램·도표·풍경·사물·추상 개념만 있는 장면 = 제외.
- 억지로 다 넣지 말 것. 인물이 어울리는 장면에만.
[장면 (번호: 설명)]
${list}
출력은 JSON만: {"orders":[번호,...]}`;
  try {
    const c = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(c.choices[0].message.content || "{}");
    return new Set((parsed.orders || []).filter((n: unknown) => typeof n === "number"));
  } catch {
    return new Set();
  }
}

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
    await logEvent(projectId, "generate_start", { meta: { total } });

    // 업소 실제 사진 → 장면 매칭 (생성 1회). 사진이 있으면 AI가 적합 장면에 배치 → 그 장면은 사진을 화풍 변환.
    const corp = project.corporate as { photos?: { url: string; label: string }[] } | undefined;
    const photoByScene = new Map<string, string>();
    if (corp?.photos?.length) {
      try {
        const assigns = await matchPhotosToScenes(
          scenes as { id: string; order: number; visualIntent?: string; narration?: string }[],
          corp.photos
        );
        // 사진 1장 = 최대 1개 장면(중복 배정 차단). 나머지 장면은 스토리 기반 일반 생성.
        const usedPhoto = new Set<number>();
        const b = db.batch();
        for (const s of scenes as { id: string; order: number }[]) {
          const idx = assigns[s.order];
          if (typeof idx === "number" && corp.photos[idx] && !usedPhoto.has(idx)) {
            usedPhoto.add(idx);
            photoByScene.set(s.id, corp.photos[idx].url);
            b.update(db.collection("projects").doc(projectId).collection("scenes").doc(s.id), { usePhotoIndex: idx });
          }
        }
        await b.commit();
      } catch (e) {
        console.error("photo match failed:", e);
      }
    }

    // 캐릭터(인물) 참조 → 사람 등장 장면 선별. 그 장면들만 참조 인물의 "느낌"을 반영해 생성.
    const characterRefUrl = project.characterRefUrl as string | undefined;
    const charScenes = new Set<number>();
    if (characterRefUrl) {
      try {
        const orders = await matchCharacterScenes(
          scenes as { id: string; order: number; visualIntent?: string; narration?: string }[]
        );
        orders.forEach((o) => charScenes.add(o));
      } catch (e) { console.error("character match failed:", e); }
    }

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
                photoUrl: photoByScene.get(sceneId),
                characterRefUrl: charScenes.has(scene.order as number) ? characterRefUrl : undefined,
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
            await logEvent(projectId, "scene_error", {
              status: "error",
              message: e instanceof Error ? e.message : "장면 처리 실패",
              meta: { sceneId: scene.id, order: scene.order },
            });
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

    // 크레딧은 승인(approve) 시 이미 선차감(hold)됨 → 성공 시 확정(settled) 표시만.
    try {
      await db.collection("projects").doc(projectId).update({ creditSettled: true });
    } catch { /* noop */ }

    await logEvent(projectId, "generate_done", {
      status: "ok",
      message: `생성 완료 (이미지 ${imageCount}/${total})`,
      meta: { imageCount, total, imageCostUsd: Math.round(imageCostUsd * 10000) / 10000 },
    });
    return NextResponse.json({ ok: true, total });
  } catch (e) {
    console.error(e);
    // 생성 실패 → 선차감했던 크레딧 환불(확정 전·미환불 건만)
    let refunded = 0;
    try {
      const projData = (await db.collection("projects").doc(projectId).get()).data() ?? {};
      const hold = (projData.creditHold as number) ?? 0;
      if (hold > 0 && !projData.creditSettled && !projData.creditRefunded && projData.ownerId) {
        await refundCredits(projData.ownerId as string, hold, projectId, "생성 실패 환불");
        await db.collection("projects").doc(projectId).update({ creditRefunded: true });
        refunded = hold;
      }
    } catch (re) { console.error("refund failed:", re); }
    await db.collection("projects").doc(projectId).update({
      status: "error",
      updatedAt: FieldValue.serverTimestamp(),
    });
    await logEvent(projectId, "error", {
      status: "error",
      message: e instanceof Error ? e.message : "생성 파이프라인 실패",
      meta: refunded > 0 ? { refundedCredits: refunded } : undefined,
    });
    return NextResponse.json({ error: "generate pipeline failed" }, { status: 500 });
  }
}
