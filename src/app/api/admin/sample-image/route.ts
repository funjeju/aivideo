import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthedUser, isAdmin } from "@/lib/auth";
import { getStylePack, imageSizeForAspect } from "@/lib/style-packs";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

// 이미지 1장 생성에 수십 초 걸릴 수 있음
export const maxDuration = 120;

// 429를 Retry-After+백오프로 자동 흡수 (Tier 1 대비)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 3 });

// 붓 테스트 샘플 세트(가장 최근 1세트)를 보관하는 doc
const setRef = () => adminDb().collection("settings").doc("brushSamples");

/** 저장된 샘플 세트(주제·대본·화풍별 이미지 URL) 반환 */
export async function GET(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const d = (await setRef().get()).data() ?? {};
  return NextResponse.json({
    subject: d.subject ?? "",
    narration: d.narration ?? "",
    images: d.images ?? {},
  });
}

/**
 * 어드민 붓 테스트용 샘플 이미지 생성. 한 줄 주제 + 스타일팩 → gpt-image-2 1장.
 * Storage에 저장(화풍별 고정 경로) + 세트 메타(주제·대본·URL)를 Firestore에 누적 →
 * 다음에 화면 들어오면 그대로 다시 보임(재생성 불필요).
 */
export async function POST(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const { stylePackId, subject, quality, aspect, narration } = await req.json();
    if (!subject || !String(subject).trim()) {
      return NextResponse.json({ error: "subject required" }, { status: 400 });
    }

    const pack = getStylePack(stylePackId ?? "whiteboard");
    const prompt = pack.imagePrompt.template.replace("{subject}", String(subject).trim());
    const q: "low" | "medium" = quality === "medium" ? "medium" : "low";
    const size = imageSizeForAspect(aspect ?? "9:16");

    const r = await openai.images.generate({ model: "gpt-image-2", prompt, n: 1, size, quality: q });
    const b64 = r.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image data returned");

    // Storage 저장 (화풍별 고정 경로, 덮어쓰기) → 캐시버스트 위해 URL에 ?t=
    const bucket = adminStorage().bucket();
    const path = `admin/brush-samples/${pack.id}.png`;
    const file = bucket.file(path);
    await file.save(Buffer.from(b64 as string, "base64"), { metadata: { contentType: "image/png" } });
    await file.makePublic();
    const url = `https://storage.googleapis.com/${bucket.name}/${path}?t=${Date.now()}`;

    // 세트 메타 누적(merge): 주제·대본 갱신 + 해당 화풍 이미지 URL 기록
    await setRef().set(
      {
        subject: String(subject).trim(),
        narration: typeof narration === "string" ? narration : "",
        images: { [pack.id]: url },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ stylePackId: pack.id, image: url });
  } catch (e) {
    console.error("sample-image failed:", e);
    return NextResponse.json({ error: "generation failed" }, { status: 500 });
  }
}
