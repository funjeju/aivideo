import { NextRequest, NextResponse } from "next/server";
import { adminStorage } from "@/lib/firebase/admin";
import { synthesizeTTS } from "@/lib/tts";

const SAMPLE_TEXT = "안녕하세요. 지금 이 목소리로 영상 나레이션을 만들어 드립니다.";

/** 오디오 바이트를 직접 반환 (redirect 없이 — <audio> 호환성 안전). 캐시는 Storage에 보관. */
export async function GET(req: NextRequest) {
  const voiceId = req.nextUrl.searchParams.get("voiceId") ?? "kr-aoede";

  try {
    const bucket = adminStorage().bucket();
    const cachePath = `voice-previews/${voiceId}.mp3`;
    const cacheFile = bucket.file(cachePath);

    let buffer: Buffer;
    const [exists] = await cacheFile.exists();
    if (exists) {
      const [data] = await cacheFile.download();
      buffer = data;
    } else {
      buffer = await synthesizeTTS(SAMPLE_TEXT, voiceId);
      await cacheFile.save(buffer, { metadata: { contentType: "audio/mpeg" } });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    console.error("voice preview failed:", e);
    return NextResponse.json({ error: "voice preview failed" }, { status: 500 });
  }
}
