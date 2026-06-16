import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeRequest, ownsProject } from "@/lib/auth";

// 워커 콜드스타트(scale-to-zero) 시 202 응답까지 수십 초 걸릴 수 있어 여유를 둔다.
export const maxDuration = 60;

/**
 * 렌더 작업 등록. renderJobs 문서를 만들고 Worker를 트리거한다.
 * Vercel은 주문만 받고(즉시 반환), 실제 렌더는 Cloud Run Worker가 수행.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeRequest(req);
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { projectId } = await req.json();
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    if (!(await ownsProject(auth, projectId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const db = adminDb();
    const projectSnap = await db.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) {
      return NextResponse.json({ error: "project not found" }, { status: 404 });
    }
    const ownerId = projectSnap.data()?.ownerId;

    // renderJobs 문서 생성
    const jobRef = await db.collection("renderJobs").add({
      projectId,
      ownerId,
      type: "full",
      status: "queued",
      progress: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Worker 트리거 — 반드시 await 한다.
    // await 없이 fire-and-forget하면 Vercel이 응답 반환 즉시 함수를 종료시켜
    // 이 fetch가 워커에 도달하기 전에 잘린다 → 작업이 "queued"에 영원히 묶임.
    // 워커는 202를 즉시 반환(렌더는 워커가 비동기 수행)하므로 await해도 빠르다.
    const workerUrl = process.env.RENDER_WORKER_URL;
    if (!workerUrl) {
      console.error("RENDER_WORKER_URL not set — worker not triggered");
      await jobRef.update({ status: "error", error: "RENDER_WORKER_URL not configured", updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ error: "render worker not configured" }, { status: 500 });
    }
    try {
      const res = await fetch(`${workerUrl}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: jobRef.id, projectId }),
        signal: AbortSignal.timeout(55000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`worker ${res.status}: ${body.slice(0, 200)}`);
      }
    } catch (e) {
      console.error("worker trigger failed:", e);
      await jobRef.update({ status: "error", error: `worker trigger failed: ${String(e)}`, updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ error: "worker trigger failed" }, { status: 502 });
    }

    // 워커가 수락(202)한 뒤에만 렌더링 상태로 — 트리거 실패 시 직전 상태 유지 → 재시도 가능
    await db.collection("projects").doc(projectId).update({
      status: "rendering",
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ jobId: jobRef.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "render registration failed" }, { status: 500 });
  }
}
