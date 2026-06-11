// 수정된 /api/tts 회귀 테스트 — durationSec이 실측값으로 저장되는지
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

initializeApp({ credential: cert(JSON.parse(env.FIREBASE_ADMIN_SA_KEY)) });
const db = getFirestore();

const projectId = "eeBrHY7speXIUPNx5VFP";
const scenesSnap = await db.collection("projects").doc(projectId).collection("scenes").orderBy("order").limit(1).get();
const sceneDoc = scenesSnap.docs[0];
const sceneId = sceneDoc.id;
const narration = sceneDoc.data().narration;

console.log("장면:", sceneId, "—", narration);

const res = await fetch("http://localhost:3000/api/tts", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ projectId, sceneId, narration, voiceId: "nova" }),
});
const data = await res.json();

if (!res.ok) {
  console.log("❌ TTS 라우트 실패:", data);
  process.exit(1);
}

console.log("✅ 응답 durationSec:", data.durationSec, "초 (기존 버그면 2.00이 나옴)");

// Firestore에 저장됐는지 확인
const after = await db.collection("projects").doc(projectId).collection("scenes").doc(sceneId).get();
console.log("✅ Firestore durationSec:", after.data().durationSec);

const ok = data.durationSec > 3; // 28자 한국어 문장은 실측 4초 이상이어야 정상
console.log(ok ? "✅ 실측값으로 판단됨" : "❌ 여전히 추정값 같음");
process.exit(0);
