import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthedUser, isAdmin } from "@/lib/auth";
import { getStylePack } from "@/lib/style-packs";

// 이미지 1장 생성에 수십 초 걸릴 수 있음
export const maxDuration = 120;

// 429를 Retry-After+백오프로 자동 흡수 (Tier 1 대비)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 3 });

/**
 * 어드민 붓 테스트용 샘플 이미지 생성. 한 줄 주제 + 스타일팩 → gpt-image-2 1장.
 * Firestore/Storage 저장 없이 base64 data URL을 바로 반환(테스트 전용, 휘발).
 */
export async function POST(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const { stylePackId, subject } = await req.json();
    if (!subject || !String(subject).trim()) {
      return NextResponse.json({ error: "subject required" }, { status: 400 });
    }

    const pack = getStylePack(stylePackId ?? "whiteboard");
    const prompt = pack.imagePrompt.template.replace("{subject}", String(subject).trim());

    const r = await openai.images.generate({
      model: "gpt-image-2",
      prompt,
      n: 1,
      size: pack.imagePrompt.size as "1024x1024" | "1024x1536" | "1536x1024",
      quality: pack.imagePrompt.quality as "high" | "medium" | "low",
    });

    const b64 = r.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image data returned");

    return NextResponse.json({
      stylePackId: pack.id,
      image: `data:image/png;base64,${b64}`,
    });
  } catch (e) {
    console.error("sample-image failed:", e);
    return NextResponse.json({ error: "generation failed" }, { status: 500 });
  }
}
