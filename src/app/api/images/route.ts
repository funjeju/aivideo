import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { getStylePack, imageSizeForAspect, inImageTextDirective, localizeTemplate } from "@/lib/style-packs";
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
    const { visualIntent, stylePackId, photoUrl, characterRefUrl } = body;

    if (!projectId || !sceneId || !visualIntent) {
      return NextResponse.json({ error: "projectId, sceneId, visualIntent required" }, { status: 400 });
    }
    if (!(await ownsProject(auth, projectId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const pack = getStylePack(stylePackId ?? "whiteboard");

    // 프로젝트 비율에 맞춰 이미지 해상도 결정 (canvas.aspect와 정합)
    const projData = (await adminDb().collection("projects").doc(projectId).get()).data();
    const size = imageSizeForAspect(projData?.aspect ?? "9:16");

    // 업소용(기업) 영상이면 매 장면 프롬프트에 사명 정확 표기 지시 + (옵션)로고 reference 반영.
    // 업체용 테스트 페이지(corporate-sample)와 동일한 방식.
    const corp = projData?.corporate as
      | { companyKo?: string; companyEn?: string; logoUrl?: string; useLogoRef?: boolean }
      | undefined;
    let brandInstr = "";
    let logoBuf: Buffer | null = null;
    if (corp) {
      const brand: string[] = [];
      if (corp.companyKo) brand.push(`한글 "${corp.companyKo}"`);
      if (corp.companyEn) brand.push(`영문 "${corp.companyEn}"`);
      if (brand.length) {
        brandInstr = ` 이 장면에 회사명이 보일 자리(간판/배너/라벨/명패 등)가 있으면 또렷하고 정확하게 표기하라: ${brand.join(" / ")}. 철자를 절대 틀리지 말 것. 단, 장면 맥락상 어색하면 억지로 넣지 말 것.`;
      }
      if (corp.useLogoRef && corp.logoUrl) {
        try {
          const r = await fetch(corp.logoUrl);
          if (r.ok) {
            logoBuf = Buffer.from(await r.arrayBuffer());
            brandInstr += " 제공된 로고 이미지를 장면 속 로고 자리에 자연스럽게 반영하라.";
          }
        } catch { /* 로고 fetch 실패 시 텍스트 지시만 */ }
      }
    }

    // 업소 실제 사진을 이 장면에 화풍 변환해 쓰는 경우(매칭 단계에서 photoUrl 전달)
    let photoBuf: Buffer | null = null;
    if (typeof photoUrl === "string" && photoUrl.startsWith("http")) {
      try {
        const r = await fetch(photoUrl);
        if (r.ok) photoBuf = Buffer.from(await r.arrayBuffer());
      } catch { /* 사진 fetch 실패 시 일반 생성으로 폴백 */ }
    }

    // 캐릭터 참조(전역 모델 이미지) — 이 인물의 "분위기·인상만" 느슨하게 참고해 등장시킴(똑같이 베끼지 않음).
    let charBuf: Buffer | null = null;
    if (typeof characterRefUrl === "string" && characterRefUrl.startsWith("http")) {
      try {
        const r = await fetch(characterRefUrl);
        if (r.ok) charBuf = Buffer.from(await r.arrayBuffer());
      } catch { /* 참조 fetch 실패 시 일반 생성으로 폴백 */ }
    }
    const charInstr = charBuf
      ? " 제공된 인물 참조 이미지는 등장인물의 분위기·인상·특징만 느슨하게 참고하라(똑같이 베끼지 말고, 위 화풍에 맞춰 자유롭게 그려라). 이 장면에 그 인물이 자연스럽게 등장하면 된다."
      : "";

    // 사진이 있으면 "이 사진을 화풍으로 변환"(구도 유지), 없으면 일반 생성.
    // en 영상이면 템플릿의 한글-라벨 유도 맥락어를 먼저 중화(화풍 정의어는 보존).
    const tmpl = localizeTemplate(pack.imagePrompt.template, projData?.contentLocale ?? "ko");
    const styleDesc = tmpl.replace("{subject}", photoBuf ? "the scene in the provided photo" : visualIntent);
    
    // 이미지 속 라벨 "언어"를 콘텐츠 언어(ko/en)에 맞춰 고정 — 라벨 단일 출처(style-packs).
    // ko=한글 또렷이 / en=영어만(한글 금지). 라벨을 막지 않고 언어만 고정한다.
    const textDirective = inImageTextDirective(projData?.contentLocale ?? "ko");

    // 반복 등장 인물 일관성: 원고 LLM이 만든 characterSheet가 있으면 매 장면에 주입.
    // 인물이 그려질 때만 적용(장면에 사람 없으면 모델이 무시). 텍스트라 추가 비용 없음.
    const charSheet = typeof projData?.characterSheet === "string" ? projData.characterSheet.trim() : "";
    const charSheetInstr = charSheet
      ? (projData?.contentLocale === "en"
          ? ` CHARACTER CONSISTENCY: if a person appears in this scene, they MUST match this exact appearance (same face, hair, build, clothing as in every other scene): ${charSheet}.`
          : ` 등장인물 일관성: 이 장면에 인물이 등장하면 반드시 다음 외형을 정확히 유지하라(다른 모든 장면과 같은 얼굴·헤어·체형·복장): ${charSheet}.`)
      : "";

    const prompt = (photoBuf
      ? `${styleDesc} 제공된 장소 실제 사진의 구도·공간·핵심 피사체를 유지하되, 이 화풍으로 다시 그려라(사진을 그대로 베끼지 말고 화풍으로 재해석).${brandInstr}`
      : styleDesc + brandInstr) + charInstr + charSheetInstr + textDirective;

    // 화질은 무조건 low 고정(비용 단순화·예측가능성). 티어 차이는 프레임·비디오·길이로만.
    const quality = "low" as const;

    let imageUrl = "";
    let cost = 0;
    let regenerations = 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // gpt-image 계열은 항상 b64_json 반환 (response_format 불필요)
        // reference 이미지(사진 먼저, 로고 다음)가 있으면 edit, 없으면 generate
        let response;
        const refs = [];
        if (photoBuf) refs.push(await toFile(photoBuf, "photo.png", { type: "image/png" }));
        if (logoBuf) refs.push(await toFile(logoBuf, "logo.png", { type: "image/png" }));
        if (charBuf) refs.push(await toFile(charBuf, "character.png", { type: "image/png" }));
        if (refs.length > 0) {
          response = await openai.images.edit({ model: "gpt-image-2", image: refs.length === 1 ? refs[0] : refs, prompt, size, quality });
        } else {
          response = await openai.images.generate({ model: "gpt-image-2", prompt, n: 1, size, quality });
        }

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

        // gpt-image-2 1024x1536 low 원가 ≈ $0.02 (전 영상 low 고정)
        cost = 0.02;
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
