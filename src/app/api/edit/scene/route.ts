import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * 장면 단위 사후 편집.
 * - action "regenerate-image": 해당 장면 이미지 재생성 → Vision → Planner
 * - action "update-text": narration 수정 → TTS 재합성 → Planner(타이밍 재계산)
 *
 * 편집 후 클라이언트가 /api/render 로 부분 재렌더를 트리거한다.
 */
export async function POST(req: NextRequest) {
  try {
    const { projectId, sceneId, action, narration, visualIntent } = await req.json();
    if (!projectId || !sceneId || !action) {
      return NextResponse.json({ error: "projectId, sceneId, action required" }, { status: 400 });
    }

    const origin = req.nextUrl.origin;
    const db = adminDb();
    const projectSnap = await db.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) return NextResponse.json({ error: "project not found" }, { status: 404 });
    const project = projectSnap.data()!;
    const sceneRef = db.collection("projects").doc(projectId).collection("scenes").doc(sceneId);

    if (action === "update-text") {
      if (!narration?.trim()) return NextResponse.json({ error: "narration required" }, { status: 400 });
      // 1. narration 저장
      await sceneRef.update({ narration, updatedAt: FieldValue.serverTimestamp() });
      // 2. TTS 재합성 (durationSec 갱신)
      const ttsRes = await fetch(`${origin}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sceneId, narration, voiceId: project.voiceId ?? "nova" }),
      });
      if (!ttsRes.ok) return NextResponse.json({ error: "tts failed" }, { status: 500 });
      // 3. Planner 재실행 (durationSec 변경 → startAt/endAt 재계산)
      await fetch(`${origin}/api/planner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sceneId }),
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "regenerate-image") {
      const scene = (await sceneRef.get()).data();
      const intent = visualIntent ?? scene?.visualIntent;
      // visualIntent 변경 시 저장
      if (visualIntent && visualIntent !== scene?.visualIntent) {
        await sceneRef.update({ visualIntent });
      }
      // 1. 이미지 재생성
      const imgRes = await fetch(`${origin}/api/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sceneId, visualIntent: intent, stylePackId: project.stylePackId }),
      });
      if (!imgRes.ok) return NextResponse.json({ error: "image failed" }, { status: 500 });
      const imageUrl = (await sceneRef.get()).data()?.imageUrl;
      // 2. Vision → 3. Planner
      if (imageUrl) {
        await fetch(`${origin}/api/vision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, sceneId, imageUrl }),
        });
        await fetch(`${origin}/api/planner`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, sceneId }),
        });
      }
      return NextResponse.json({ ok: true, imageUrl });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    console.error("scene edit failed:", e);
    return NextResponse.json({ error: "edit failed" }, { status: 500 });
  }
}
