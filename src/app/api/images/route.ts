import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { getStylePack, imageSizeForAspect } from "@/lib/style-packs";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeRequest, ownsProject } from "@/lib/auth";

// maxRetries: SDK가 429(rate limit)/5xx를 Retry-After 존중 + 지수 백오프로 자동 재시도.
// Tier 1처럼 한도 빠듯한 계정에서 동시 생성 시 간헐 429를 흡수(실패 대신 자동 감속).
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 5 });
const MAX_RETRIES = 2;

export async function POST(req: NextRequest) {
  // body를 try 밖에서 파싱 — catch에서 projectId/sceneId로 에러 상태를 기록해야 함
  let projectId = "";
  let sceneId = "";
  try {
    const auth = await authorizeRequest(req);
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json();
    projectId = body.projectId;
    sceneId = body.sceneId;
    const { visualIntent, stylePackId } = body;

    if (!projectId || !sceneId || !visualIntent) {
      return NextResponse.json({ error: "projectId, sceneId, visualIntent required" }, { status: 400 });
    }
    if (!(await ownsProject(auth, projectId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const pack = getStylePack(stylePackId ?? "whiteboard");
    const prompt = pack.imagePrompt.template.replace("{subject}", visualIntent);

    // 프로젝트 비율에 맞춰 이미지 해상도 결정 (canvas.aspect와 정합)
    const projData = (await adminDb().collection("projects").doc(projectId).get()).data();
    const size = imageSizeForAspect(projData?.aspect ?? "9:16");

    let imageUrl = "";
    let cost = 0;
    let regenerations = 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await openai.images.generate({
          model: "gpt-image-2", // gpt-image 계열은 항상 b64_json 반환 (response_format 불필요)
          prompt,
          n: 1,
          size,
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

        // gpt-image-2 1024x1536 대략 원가: high≈$0.19, medium≈$0.06, low≈$0.02
        cost = pack.imagePrompt.quality === "high" ? 0.19 : pack.imagePrompt.quality === "low" ? 0.02 : 0.06;
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
