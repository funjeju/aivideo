import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { adminStorage } from "@/lib/firebase/admin";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SAMPLE_TEXT = "안녕하세요. 지금 이 목소리로 영상 나레이션을 만들어 드립니다.";
const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
type OpenAIVoice = typeof OPENAI_VOICES[number];

export async function GET(req: NextRequest) {
  const voiceId = req.nextUrl.searchParams.get("voiceId") ?? "nova";

  try {
    const bucket = adminStorage().bucket();
    const cachePath = `voice-previews/${voiceId}.mp3`;
    const cacheFile = bucket.file(cachePath);

    // 캐시 확인
    const [exists] = await cacheFile.exists();
    if (exists) {
      const [url] = await cacheFile.getSignedUrl({
        action: "read",
        expires: Date.now() + 1000 * 60 * 60, // 1시간
      });
      return NextResponse.redirect(url);
    }

    // 캐시 없으면 합성 후 저장
    const voice: OpenAIVoice = OPENAI_VOICES.includes(voiceId as OpenAIVoice)
      ? (voiceId as OpenAIVoice)
      : "nova";

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: SAMPLE_TEXT,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    await cacheFile.save(buffer, { metadata: { contentType: "audio/mpeg" } });

    const [url] = await cacheFile.getSignedUrl({
      action: "read",
      expires: Date.now() + 1000 * 60 * 60,
    });
    return NextResponse.redirect(url);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "voice preview failed" }, { status: 500 });
  }
}
