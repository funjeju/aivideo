// voices 컬렉션 시딩 (OpenAI TTS 보이스). 미리듣기는 /api/voice-preview 동적 생성.
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
initializeApp({ credential: cert(JSON.parse(env.FIREBASE_ADMIN_SA_KEY)) });
const db = getFirestore();

const VOICES = [
  { id: "nova",    displayName: "따뜻한 여성",   gender: "female", tags: ["warm", "narration"],  sortOrder: 1 },
  { id: "shimmer", displayName: "차분한 여성",   gender: "female", tags: ["calm", "soft"],       sortOrder: 2 },
  { id: "alloy",   displayName: "중립 톤",       gender: "neutral",tags: ["neutral", "clean"],   sortOrder: 3 },
  { id: "echo",    displayName: "낮은 남성",     gender: "male",   tags: ["deep", "steady"],     sortOrder: 4 },
  { id: "onyx",    displayName: "중후한 남성",   gender: "male",   tags: ["rich", "authoritative"], sortOrder: 5 },
  { id: "fable",   displayName: "이야기꾼",      gender: "neutral",tags: ["storytelling"],       sortOrder: 6 },
];

for (const v of VOICES) {
  await db.collection("voices").doc(v.id).set({
    id: v.id,
    provider: "openai",
    providerVoiceId: v.id,
    displayName: v.displayName,
    language: "ko",
    gender: v.gender,
    tags: v.tags,
    previewUrl: "",        // /api/voice-preview?voiceId=<id> 로 동적 재생
    enabled: true,
    tier: "free",
    sortOrder: v.sortOrder,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log("✅", v.id, v.displayName);
}
console.log("\n보이스 6종 시딩 완료");
process.exit(0);
