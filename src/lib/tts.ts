import crypto from "node:crypto";
import OpenAI from "openai";
import { getVoice } from "@/lib/voices";

/**
 * 통합 TTS 합성 — voiceId의 provider에 따라 OpenAI 또는 Google Cloud TTS로 mp3 생성.
 * Google은 SA(FIREBASE_ADMIN_SA_KEY)로 OAuth 토큰을 직접 서명해 REST 호출(별도 키 불필요).
 */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TOKEN_URL = "https://oauth2.googleapis.com/token";
let _tok: { v: string; exp: number } | null = null;

function b64url(buf: Buffer | string) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function googleToken(): Promise<string> {
  if (_tok && Date.now() < _tok.exp - 60_000) return _tok.v;
  const raw = process.env.FIREBASE_ADMIN_SA_KEY;
  if (!raw) throw new Error("FIREBASE_ADMIN_SA_KEY missing");
  const j = JSON.parse(raw);
  const pk = String(j.private_key).replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: j.client_email, scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: TOKEN_URL, iat: now, exp: now + 3600,
  }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${b64url(signer.sign(pk))}`;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error(`google token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  _tok = { v: d.access_token, exp: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return _tok.v;
}

/** 텍스트 + voiceId → mp3 Buffer. provider 자동 판별. */
export async function synthesizeTTS(text: string, voiceId: string | undefined): Promise<Buffer> {
  const voice = getVoice(voiceId);

  if (voice.provider === "google") {
    const token = await googleToken();
    const res = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "ko-KR", name: voice.googleName },
        audioConfig: { audioEncoding: "MP3" },
      }),
    });
    if (!res.ok) throw new Error(`google tts ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const d = await res.json();
    return Buffer.from(d.audioContent, "base64");
  }

  // openai
  const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: voice.id as never, input: text });
  return Buffer.from(await mp3.arrayBuffer());
}
