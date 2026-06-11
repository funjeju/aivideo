// GCS 버킷 CORS 설정 — 렌더 페이지(crossOrigin anonymous)가 이미지를 canvas에 그릴 수 있게
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

initializeApp({
  credential: cert(JSON.parse(env.FIREBASE_ADMIN_SA_KEY)),
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});

const bucket = getStorage().bucket();
await bucket.setCorsConfiguration([
  {
    origin: ["*"],
    method: ["GET"],
    responseHeader: ["Content-Type"],
    maxAgeSeconds: 3600,
  },
]);

const [meta] = await bucket.getMetadata();
console.log("✅ CORS 설정 완료:", JSON.stringify(meta.cors));
process.exit(0);
