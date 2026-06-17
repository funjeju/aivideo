import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeRequest, ownsProject } from "@/lib/auth";
import { tasksConfigured, enqueueRender, workerUrl } from "@/lib/queue";
import { logEvent } from "@/lib/genlog";

export const maxDuration = 60;

/**
 * 렌더 작업 등록. renderJobs 문서를 만들고 Cloud Tasks 큐에 적재한다.
 * Vercel은 주문(큐 적재)만 하고 즉시 반환, 실제 렌더는 Cloud Run Worker가 동기 수행.
 * 큐가 워커로 안정 전달(재시도) + concurrency=1 오토스케일로 렌더마다 인스턴스 분리(병렬).
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

    // 트리거 방식:
    // - 운영(Cloud Tasks 설정됨): 큐에 적재만 하고 즉시 반환. 워커는 동기 렌더(끝까지 응답 보류)라
    //   직접 fetch하면 Vercel maxDuration에 끊긴다 → 반드시 큐 경유.
    // - 로컬 dev(큐 미설정): 워커로 fire-and-forget fetch (로컬은 함수가 안 죽으므로 OK).
    try {
      if (tasksConfigured()) {
        await enqueueRender(jobRef.id, projectId);
      } else {
        // dev 폴백 — 응답을 기다리지 않는다(워커가 동기라 끝까지 안 돌아옴).
        fetch(`${workerUrl()}/render`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(process.env.WORKER_SECRET ? { "x-worker-secret": process.env.WORKER_SECRET } : {}),
          },
          body: JSON.stringify({ jobId: jobRef.id, projectId }),
        }).catch((e) => console.error("dev worker trigger failed:", e));
      }
    } catch (e) {
      console.error("enqueue failed:", e);
      const detail = e instanceof Error ? e.message : String(e);
      await jobRef.update({ status: "error", error: `enqueue failed: ${detail}`, updatedAt: FieldValue.serverTimestamp() });
      await logEvent(projectId, "render_error", { status: "error", message: `렌더 큐 적재 실패: ${detail}` });
      return NextResponse.json({ error: "enqueue failed", detail }, { status: 502 });
    }

    // 큐 적재 성공 → 렌더링 상태로
    await db.collection("projects").doc(projectId).update({
      status: "rendering",
      updatedAt: FieldValue.serverTimestamp(),
    });
    await logEvent(projectId, "render_queued", { status: "ok", message: "렌더 큐 적재", meta: { jobId: jobRef.id } });

    return NextResponse.json({ jobId: jobRef.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "render registration failed" }, { status: 500 });
  }
}
