import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { authorizeRequest, ownsProject } from "@/lib/auth";
import { rebakeBrushPresets } from "@/lib/pipeline/rebake";

export const maxDuration = 60;

/**
 * 프로젝트를 열 때(완료 상태) 호출. 현재 저장된 붓 프리셋을 장면 sceneSpec에 다시 굽는다.
 * diff 가드라 바뀐 게 없으면 no-op(쓰기 0). 미리보기가 최신 붓을 즉시 반영하게 한다.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeRequest(req);
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { projectId } = await req.json();
    if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
    if (!(await ownsProject(auth, projectId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const db = adminDb();
    const projectSnap = await db.collection("projects").doc(projectId).get();
    if (!projectSnap.exists) return NextResponse.json({ error: "project not found" }, { status: 404 });

    const updated = await rebakeBrushPresets(db, projectId, projectSnap.data()!);
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    console.error("refresh-brush failed:", e);
    return NextResponse.json({ error: "refresh-brush failed" }, { status: 500 });
  }
}
