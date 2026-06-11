// TTS 합성 + Storage 업로드 테스트 (~$0.001)
import { readFileSync } from "node:fs";
import OpenAI from "openai";
import { initializeApp, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
initializeApp({
  credential: cert(JSON.parse(env.FIREBASE_ADMIN_SA_KEY)),
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});

const text = "안녕하세요! 오늘은 경제학의 기본 개념인 한계효용 체감의 법칙에 대해 알아볼게요.";

console.time("TTS");
const mp3 = await openai.audio.speech.create({ model: "tts-1", voice: "nova", input: text });
console.timeEnd("TTS");

const buffer = Buffer.from(await mp3.arrayBuffer());
console.log("✅ 음성 합성 성공, 크기:", (buffer.length / 1024).toFixed(1), "KB");

const bucket = getStorage().bucket();
const path = `_test/tts-sample.mp3`;
const file = bucket.file(path);
await file.save(buffer, { metadata: { contentType: "audio/mpeg" } });
await file.makePublic();
const url = `https://storage.googleapis.com/${bucket.name}/${path}`;
console.log("✅ Storage 업로드 성공:", url);

const cost = (text.length * 15) / 1_000_000;
console.log(`글자수 ${text.length} → 비용 $${cost.toFixed(5)}`);
process.exit(0);
