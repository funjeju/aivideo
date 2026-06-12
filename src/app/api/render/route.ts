import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeRequest, ownsProject } from "@/lib/auth";

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

    await db.collection("projects").doc(projectId).update({
      status: "rendering",
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Worker 트리거
    const workerUrl = process.env.RENDER_WORKER_URL;
    if (workerUrl) {
      fetch(`${workerUrl}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: jobRef.id, projectId }),
      }).catch((e) => console.error("worker trigger failed:", e));
    } else {
      console.warn("RENDER_WORKER_URL not set — worker not triggered");
    }

    return NextResponse.json({ jobId: jobRef.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "render registration failed" }, { status: 500 });
  }
}
