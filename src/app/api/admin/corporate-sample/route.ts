import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { getAuthedUser, isAdmin } from "@/lib/auth";
import { getStylePack, imageSizeForAspect } from "@/lib/style-packs";

export const maxDuration = 180;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2 });

/**
 * 업체용 이미지 테스트. 한 줄 장면 + 회사명(국/영) + (선택)로고를 받아
 * gpt-image-2로 샘플 생성. 사명은 프롬프트에 정확 표기 지시, 로고는 reference(edit)로 반영 시도.
 * 영상 만들기 전에 "사명·로고가 제대로 나오나"를 미리 검증하는 용도.
 */
export async function POST(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const { subject, companyKo, companyEn, quality, aspect, stylePackId, logoDataUrl, useLogoRef, photoDataUrl } = await req.json();
    const willUsePhoto = typeof photoDataUrl === "string" && photoDataUrl.startsWith("data:image/");
    if ((!subject || !String(subject).trim()) && !willUsePhoto) {
      return NextResponse.json({ error: "subject or photo required" }, { status: 400 });
    }

    const pack = getStylePack(stylePackId ?? "flat-icon");
    const q: "low" | "medium" | "high" = ["low", "medium", "high"].includes(quality) ? quality : "high";
    const size = imageSizeForAspect(aspect ?? "9:16");

    // 사명 정확 표기 지시
    const brand: string[] = [];
    if (companyKo) brand.push(`한글 "${companyKo}"`);
    if (companyEn) brand.push(`영문 "${companyEn}"`);
    const brandInstr = brand.length
      ? ` 화면 안 간판/배너/라벨에 회사명을 또렷하고 정확하게 표기하라: ${brand.join(" / ")}. 철자를 절대 틀리지 말 것.`
      : "";
    const willUseLogo = !!useLogoRef && typeof logoDataUrl === "string" && logoDataUrl.startsWith("data:image/");
    const logoInstr = willUseLogo ? " 제공된 로고 이미지를 장면 속 로고 자리에 최대한 정확히 반영하라." : "";

    // 사진이 있으면 "이 사진을 화풍으로 변환"(구도 유지), 없으면 기존 subject 생성.
    const styleDesc = pack.imagePrompt.template.replace("{subject}", willUsePhoto ? "the scene in the provided photo" : String(subject ?? "").trim());
    const prompt = willUsePhoto
      ? `${styleDesc} 제공된 업소 사진의 구도·공간·핵심 피사체를 유지하되, 위 화풍으로 다시 그려라(사진을 그대로 베끼지 말고 화풍으로 재해석).${brandInstr}${logoInstr}`
      : styleDesc + brandInstr + logoInstr;

    function toBuf(dataUrl: string) { return Buffer.from(dataUrl.split(",")[1] ?? "", "base64"); }

    let b64: string | undefined;
    let usage: Record<string, unknown> | undefined;
    if (willUsePhoto || willUseLogo) {
      // reference 이미지들(사진 먼저, 로고 다음)로 edit
      const images = [];
      if (willUsePhoto) images.push(await toFile(toBuf(photoDataUrl), "photo.png", { type: "image/png" }));
      if (willUseLogo) images.push(await toFile(toBuf(logoDataUrl), "logo.png", { type: "image/png" }));
      const r = await openai.images.edit({ model: "gpt-image-2", image: images.length === 1 ? images[0] : images, prompt, size, quality: q });
      b64 = r.data?.[0]?.b64_json;
      usage = r.usage as unknown as Record<string, unknown>;
    } else {
      const r = await openai.images.generate({ model: "gpt-image-2", prompt, n: 1, size, quality: q });
      b64 = r.data?.[0]?.b64_json;
      usage = r.usage as unknown as Record<string, unknown>;
    }
    if (!b64) throw new Error("no image data");

    // 실측 토큰 → 원가 (image in $8/1M, text in $5/1M, image out $30/1M)
    const u = (usage ?? {}) as { input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } };
    const imgIn = u.input_tokens_details?.image_tokens ?? 0;
    const txtIn = u.input_tokens_details?.text_tokens ?? 0;
    const out = u.output_tokens ?? 0;
    const costUsd = (imgIn * 8 + txtIn * 5 + out * 30) / 1_000_000;

    return NextResponse.json({
      image: `data:image/png;base64,${b64}`,
      prompt,
      quality: q,
      usedLogo: willUseLogo,
      usedPhoto: willUsePhoto,
      tokens: { imageInput: imgIn, textInput: txtIn, output: out },
      costUsd: Math.round(costUsd * 10000) / 10000,
      costKrw: Math.round(costUsd * 1380),
    });
  } catch (e) {
    console.error("corporate-sample failed:", e);
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
