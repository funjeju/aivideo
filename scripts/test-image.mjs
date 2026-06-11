// 이미지 생성 + 한글 in-image 텍스트 오타율 실측 (~$0.19)
import { readFileSync, writeFileSync } from "node:fs";
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

// 수묵담채 스타일 + 한글 라벨을 명시적으로 in-image로 요구 (오타율 최악 케이스 테스트)
const prompt = `korean ink wash painting (sumukhwa), a single apple on a table with a Korean text label "한계효용" written above it in brush calligraphy, soft diffused ink lines, generous negative space, hanji paper texture, minimal, elegant`;

console.log("프롬프트:", prompt);
console.time("이미지 생성");
const response = await openai.images.generate({
  model: "gpt-image-2",
  prompt,
  n: 1,
  size: "1024x1536",
  quality: "high",
});
console.timeEnd("이미지 생성");

const b64 = response.data?.[0]?.b64_json;
if (!b64) {
  console.error("❌ 이미지 데이터 없음:", JSON.stringify(response).slice(0, 500));
  process.exit(1);
}
const buffer = Buffer.from(b64, "base64");
console.log("✅ 이미지 생성 성공, 크기:", (buffer.length / 1024).toFixed(1), "KB");

// 로컬 저장 (눈으로 한글 오타 확인용)
const localPath = new URL("../scripts/test-image-output.png", import.meta.url);
writeFileSync(localPath, buffer);
console.log("✅ 로컬 저장:", localPath.pathname);

// Storage 업로드
const bucket = getStorage().bucket();
const path = `_test/image-korean.png`;
const file = bucket.file(path);
await file.save(buffer, { metadata: { contentType: "image/png" } });
await file.makePublic();
console.log("✅ Storage:", `https://storage.googleapis.com/${bucket.name}/${path}`);
console.log("\n비용: 약 $0.19 (gpt-image-2 high 1024x1536)");
process.exit(0);
