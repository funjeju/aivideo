import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeRequest(req);
    if (!auth || !auth.uid) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    // ownerId는 클라이언트 값이 아니라 검증된 토큰의 uid를 사용
    const ownerId = auth.uid;

    const formData = await req.formData();
    const mode = formData.get("mode") as string;
    const topic = formData.get("topic") as string | null;
    const targetLength = Number(formData.get("targetLength") ?? 180);
    const stylePackId = formData.get("stylePackId") as string ?? "whiteboard";
    const voiceId = formData.get("voiceId") as string ?? "nova";
    const contentLocale = formData.get("contentLocale") as string ?? "ko";
    const file = formData.get("file") as File | null;

    if (!mode) {
      return NextResponse.json({ error: "mode required" }, { status: 400 });
    }

    let sourceText = "";
    let sourceFileUrl = "";

    if (mode === "faithful" && file) {
      // 파일 텍스트 추출
      const { extractText } = await import("@/lib/pipeline/extractText");
      sourceText = await extractText(file);

      // Storage 업로드
      const buffer = Buffer.from(await file.arrayBuffer());
      const bucket = adminStorage().bucket();
      const filePath = `uploads/${ownerId}/${Date.now()}_${file.name}`;
      const storageFile = bucket.file(filePath);
      await storageFile.save(buffer, { metadata: { contentType: file.type } });
      await storageFile.makePublic();
      sourceFileUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    }

    const db = adminDb();
    const docRef = await db.collection("projects").add({
      ownerId,
      title: topic ?? file?.name ?? "새 프로젝트",
      mode,
      sourceText,
      sourceFileUrl,
      targetLength,
      stylePackId,
      voiceId,
      contentLocale,
      status: "draft",
      scriptApproved: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ projectId: docRef.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "project creation failed" }, { status: 500 });
  }
}
