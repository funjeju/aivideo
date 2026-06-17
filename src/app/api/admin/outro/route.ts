import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { getAuthedUser, isAdmin } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer", "ash", "coral", "sage"] as const;
type OpenAIVoice = typeof OPENAI_VOICES[number];

/**
 * 영상 끝 고정 브랜드 아웃트로 설정. 워커가 settings/global.outro를 읽어 매 영상 끝에 합성.
 * GET: 현재 설정. POST: 설정 저장 + (text/voice 바뀌면) TTS 음성 1회 생성해 Storage에 저장.
 */
export async function GET(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const s = (await adminDb().collection("settings").doc("global").get()).data() ?? {};
  return NextResponse.json({ outro: s.outro ?? null });
}

export async function POST(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const body = await req.json();
    const enabled = !!body.enabled;
    const brand = String(body.brand ?? "easyshorts").slice(0, 40);
    const text = String(body.text ?? "다음 영상에서 또 만나요").slice(0, 60);
    const subtext = String(body.subtext ?? "구독하고 더 많은 영상 보기").slice(0, 60);
    const voiceId = OPENAI_VOICES.includes(body.voiceId as OpenAIVoice) ? (body.voiceId as OpenAIVoice) : "nova";

    const db = adminDb();
    const prev = ((await db.collection("settings").doc("global").get()).data()?.outro ?? {}) as {
      audioUrl?: string; text?: string; voiceId?: string;
    };

    // text나 voice가 바뀌었거나 음성이 아직 없으면 TTS 재생성
    let audioUrl = prev.audioUrl ?? "";
    const needTts = !audioUrl || prev.text !== text || prev.voiceId !== voiceId;
    if (needTts) {
      const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: voiceId, input: text });
      const buffer = Buffer.from(await mp3.arrayBuffer());
      const bucket = adminStorage().bucket();
      const path = `system/outro.mp3`;
      const file = bucket.file(path);
      await file.save(buffer, { metadata: { contentType: "audio/mpeg" } });
      await file.makePublic();
      audioUrl = `https://storage.googleapis.com/${bucket.name}/${path}?t=${Date.now()}`;
    }

    const outro = { enabled, brand, text, subtext, voiceId, audioUrl };
    await db.collection("settings").doc("global").set(
      { outro, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    return NextResponse.json({ outro });
  } catch (e) {
    console.error("outro save failed:", e);
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
