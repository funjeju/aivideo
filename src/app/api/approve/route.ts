import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const { projectId } = await req.json();
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    await adminDb()
      .collection("projects")
      .doc(projectId)
      .update({
        scriptApproved: true,
        status: "approved",
        updatedAt: FieldValue.serverTimestamp(),
      });

    // 이미지 생성 파이프라인 비동기 트리거 (응답을 기다리지 않음)
    const origin = req.nextUrl.origin;
    fetch(`${origin}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    }).catch(console.error);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "approve failed" }, { status: 500 });
  }
}
