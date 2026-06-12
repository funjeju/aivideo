import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { authorizeRequest } from "@/lib/auth";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
type OpenAIVoice = typeof OPENAI_VOICES[number];

/** 어드민 전용: Firebase 저장 없이 mp3 바이너리 직접 반환. 붓 테스트용. */
export async function POST(req: NextRequest) {
  const auth = await authorizeRequest(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { narration, voiceId } = await req.json();
  if (!narration) return NextResponse.json({ error: "narration required" }, { status: 400 });

  const voice: OpenAIVoice = OPENAI_VOICES.includes(voiceId as OpenAIVoice)
    ? (voiceId as OpenAIVoice)
    : "nova";

  const mp3 = await openai.audio.speech.create({ model: "tts-1", voice, input: narration });
  const buffer = Buffer.from(await mp3.arrayBuffer());

  return new NextResponse(buffer, {
    headers: { "Content-Type": "audio/mpeg", "Content-Length": String(buffer.length) },
  });
}
