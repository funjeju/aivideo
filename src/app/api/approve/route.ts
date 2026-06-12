import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeRequest, ownsProject, internalHeaders } from "@/lib/auth";

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

    await adminDb()
      .collection("projects")
      .doc(projectId)
      .update({
        scriptApproved: true,
        status: "approved",
        updatedAt: FieldValue.serverTimestamp(),
      });

    // 이미지 생성 파이프라인 비동기 트리거 (내부 시크릿으로 인증)
    const origin = req.nextUrl.origin;
    fetch(`${origin}/api/generate`, {
      method: "POST",
      headers: internalHeaders(),
      body: JSON.stringify({ projectId }),
    }).catch(console.error);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "approve failed" }, { status: 500 });
  }
}
