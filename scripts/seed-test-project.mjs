// 렌더 파이프라인 검증용 테스트 프로젝트 생성 (OpenAI 비용 0 — 기존 _test 자산 재활용)
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

const bucket = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
const imageUrl = `https://storage.googleapis.com/${bucket}/_test/image-korean.png`;
const audioUrl = `https://storage.googleapis.com/${bucket}/_test/tts-sample.mp3`;

// 프로젝트 생성
const projRef = await db.collection("projects").add({
  ownerId: "test-user",
  title: "[테스트] 렌더 검증",
  mode: "generate",
  sourceText: "",
  targetLength: 50,
  stylePackId: "ink-wash",
  voiceId: "nova",
  contentLocale: "ko",
  status: "done",
  scriptApproved: true,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});

const projectId = projRef.id;

// 2장면 — 동일 이미지/오디오 재활용. sceneSpec에 reveal objects 포함.
const scenes = [
  {
    order: 1,
    narration: "안녕하세요! 오늘은 한계효용 체감의 법칙을 알아봅니다.",
    durationSec: 4,
    imageUrl,
    audioUrl,
    imageStatus: "done",
    sceneSpec: {
      sceneId: "s1",
      order: 1,
      durationSec: 4,
      narration: "안녕하세요!",
      audioUrl,
      canvas: { aspect: "9:16", background: "paper-hanji" },
      image: { url: imageUrl, fit: "contain" },
      reveal: {
        objects: [
          { id: "title", bbox: [180, 120, 850, 320], role: "title", revealOrder: 1, strokeStyle: "brush", flowDirection: "right-to-left", startAt: 0.2, endAt: 2.0 },
          { id: "apple", bbox: [300, 700, 760, 1250], role: "illustration", revealOrder: 2, strokeStyle: "brush", flowDirection: "left-to-right", startAt: 1.5, endAt: 3.8 },
        ],
      },
      overlays: [{ type: "texture", asset: "hanji.png", opacity: 0.15 }],
      hand: { enabled: true, asset: "brush" },
    },
  },
  {
    order: 2,
    narration: "사과를 하나씩 먹을수록 만족감은 점점 줄어듭니다.",
    durationSec: 4,
    imageUrl,
    audioUrl,
    imageStatus: "done",
    sceneSpec: {
      sceneId: "s2",
      order: 2,
      durationSec: 4,
      narration: "사과를 하나씩...",
      audioUrl,
      canvas: { aspect: "9:16", background: "paper-hanji" },
      image: { url: imageUrl, fit: "contain" },
      reveal: {
        objects: [
          { id: "apple2", bbox: [300, 700, 760, 1250], role: "illustration", revealOrder: 1, strokeStyle: "brush", flowDirection: "center-out", startAt: 0.3, endAt: 3.5 },
        ],
      },
      overlays: [{ type: "texture", asset: "hanji.png", opacity: 0.15 }],
      hand: { enabled: true, asset: "brush" },
    },
  },
];

for (const s of scenes) {
  await db.collection("projects").doc(projectId).collection("scenes").add(s);
}

console.log("✅ 테스트 프로젝트 생성:", projectId);
console.log("   이미지:", imageUrl);
console.log("   오디오:", audioUrl);
console.log("\nPROJECT_ID=" + projectId);
process.exit(0);
