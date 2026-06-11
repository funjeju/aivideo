import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { getStylePack } from "@/lib/style-packs";
import { FieldValue } from "firebase-admin/firestore";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MAX_RETRIES = 2;

export async function POST(req: NextRequest) {
  // body를 try 밖에서 파싱 — catch에서 projectId/sceneId로 에러 상태를 기록해야 함
  let projectId = "";
  let sceneId = "";
  try {
    const body = await req.json();
    projectId = body.projectId;
    sceneId = body.sceneId;
    const { visualIntent, stylePackId } = body;

    if (!projectId || !sceneId || !visualIntent) {
      return NextResponse.json({ error: "projectId, sceneId, visualIntent required" }, { status: 400 });
    }

    const pack = getStylePack(stylePackId ?? "whiteboard");
    const prompt = pack.imagePrompt.template.replace("{subject}", visualIntent);

    let imageUrl = "";
    let cost = 0;
    let regenerations = 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await openai.images.generate({
          model: "gpt-image-2", // gpt-image 계열은 항상 b64_json 반환 (response_format 불필요)
          prompt,
          n: 1,
          size: pack.imagePrompt.size as "1024x1024" | "1024x1536" | "1536x1024",
          quality: pack.imagePrompt.quality as "high" | "medium" | "low",
        });

        const b64 = response.data?.[0]?.b64_json;
        if (!b64) throw new Error("no image data returned");
        const buffer = Buffer.from(b64 as string, "base64");

        // Storage 업로드
        const bucket = adminStorage().bucket();
        const filePath = `projects/${projectId}/images/${sceneId}.png`;
        const file = bucket.file(filePath);
        await file.save(buffer, { metadata: { contentType: "image/png" } });
        await file.makePublic();
        imageUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

        // gpt-image-2 high 기준: 약 $0.19/image (1024x1536)
        cost = 0.19;
        if (attempt > 0) regenerations = attempt;
        break;
      } catch (e) {
        if (attempt === MAX_RETRIES) throw e;
        regenerations++;
      }
    }

    // Firestore 갱신
    const db = adminDb();
    await db.collection("projects").doc(projectId).collection("scenes").doc(sceneId).update({
      imageUrl,
      imageStatus: "done",
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ imageUrl, cost, regenerations });
  } catch (e) {
    console.error(e);
    // 실패 시 imageStatus error 기록 (UI 무한 대기 방지)
    if (projectId && sceneId) {
      await adminDb()
        .collection("projects").doc(projectId)
        .collection("scenes").doc(sceneId)
        .update({ imageStatus: "error" })
        .catch(() => {});
    }
    return NextResponse.json({ error: "image generation failed" }, { status: 500 });
  }
}
