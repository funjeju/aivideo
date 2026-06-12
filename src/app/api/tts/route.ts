import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeRequest, ownsProject } from "@/lib/auth";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
type OpenAIVoice = typeof OPENAI_VOICES[number];

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeRequest(req);
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { projectId, sceneId, narration, voiceId } = await req.json();

    if (!projectId || !sceneId || !narration) {
      return NextResponse.json({ error: "projectId, sceneId, narration required" }, { status: 400 });
    }
    if (!(await ownsProject(auth, projectId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const voice: OpenAIVoice = OPENAI_VOICES.includes(voiceId as OpenAIVoice)
      ? (voiceId as OpenAIVoice)
      : "nova";

    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: narration,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    const charCount = narration.length;
    // tts-1 기준: $15/1M chars
    const ttsCostUsd = (charCount * 15) / 1_000_000;

    // Firebase Storage 업로드
    const bucket = adminStorage().bucket();
    const filePath = `projects/${projectId}/audio/${sceneId}.mp3`;
    const file = bucket.file(filePath);
    await file.save(buffer, { metadata: { contentType: "audio/mpeg" } });
    await file.makePublic();
    const audioUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    // 오디오 실제 길이 측정 (mp3 헤더 파싱 — 추정 아님. 타임라인의 절대 기준이므로 정확해야 함)
    let durationSec: number;
    try {
      const { parseBuffer } = await import("music-metadata");
      const meta = await parseBuffer(buffer, { mimeType: "audio/mpeg" });
      durationSec = meta.format.duration ?? 0;
    } catch {
      durationSec = 0;
    }
    if (!durationSec || durationSec <= 0) {
      // 폴백: 한국어 TTS 평균 ~5자/초
      durationSec = Math.max(charCount / 5, 1.5);
    }
    durationSec = Math.round(durationSec * 100) / 100;

    // Firestore 갱신
    const db = adminDb();
    await db
      .collection("projects")
      .doc(projectId)
      .collection("scenes")
      .doc(sceneId)
      .update({
        audioUrl,
        durationSec,
        updatedAt: FieldValue.serverTimestamp(),
      });

    return NextResponse.json({ audioUrl, durationSec, ttsCostUsd });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "tts failed" }, { status: 500 });
  }
}
