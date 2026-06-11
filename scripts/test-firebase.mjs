// Firebase Admin 연결 테스트 — Firestore 쓰기/읽기/삭제 + Storage 버킷 확인
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { readFileSync } from "node:fs";

// .env.local 수동 파싱 (FIREBASE_ADMIN_SA_KEY는 JSON 한 줄)
const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const sa = JSON.parse(env.FIREBASE_ADMIN_SA_KEY);
initializeApp({
  credential: cert(sa),
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});

const db = getFirestore();
const storage = getStorage();

console.log("프로젝트:", sa.project_id);

// 1. Firestore 쓰기
try {
  const ref = db.collection("_test").doc("ping");
  await ref.set({ at: FieldValue.serverTimestamp(), msg: "hello" });
  console.log("✅ Firestore 쓰기 성공");

  const snap = await ref.get();
  console.log("✅ Firestore 읽기 성공:", snap.data()?.msg);

  await ref.delete();
  console.log("✅ Firestore 삭제 성공");
} catch (e) {
  console.error("❌ Firestore 실패:", e.message);
}

// 2. Storage 버킷 확인
try {
  const bucket = storage.bucket();
  const [exists] = await bucket.exists();
  console.log(exists ? `✅ Storage 버킷 존재: ${bucket.name}` : `❌ Storage 버킷 없음: ${bucket.name}`);
} catch (e) {
  console.error("❌ Storage 실패:", e.message);
}

process.exit(0);
