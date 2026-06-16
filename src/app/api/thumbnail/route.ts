import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeRequest, ownsProject } from "@/lib/auth";

/**
 * 제목이 합성된 썸네일(클라에서 canvas로 그린 PNG data URL)을 받아 Storage에 저장하고
 * project.thumbnailUrl을 갱신한다. 합성 자체는 클라(브라우저 canvas)에서 수행.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeRequest(req);
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { projectId, dataUrl, sourceUrl } = await req.json();
    if (!projectId || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "projectId, dataUrl required" }, { status: 400 });
    }
    if (!(await ownsProject(auth, projectId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const b64 = dataUrl.split(",")[1] ?? "";
    const buffer = Buffer.from(b64, "base64");
    if (buffer.length === 0 || buffer.length > 8_000_000) {
      return NextResponse.json({ error: "invalid image" }, { status: 400 });
    }

    const bucket = adminStorage().bucket();
    const path = `projects/${projectId}/thumbnail.png`;
    const file = bucket.file(path);
    await file.save(buffer, { metadata: { contentType: "image/png" } });
    await file.makePublic();
    const url = `https://storage.googleapis.com/${bucket.name}/${path}?t=${Date.now()}`;

    await adminDb().collection("projects").doc(projectId).update({
      thumbnailUrl: url,
      ...(typeof sourceUrl === "string" ? { thumbnailSourceUrl: sourceUrl } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ thumbnailUrl: url });
  } catch (e) {
    console.error("thumbnail save failed:", e);
    return NextResponse.json({ error: "thumbnail save failed" }, { status: 500 });
  }
}
