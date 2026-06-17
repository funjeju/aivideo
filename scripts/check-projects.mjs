import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(process.env.FIREBASE_ADMIN_SA_KEY);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const snap = await db.collection("projects").orderBy("updatedAt", "desc").limit(8).get();
console.log(`최근 프로젝트 ${snap.size}개\n`);

for (const d of snap.docs) {
  const p = d.data();
  const scenes = await d.ref.collection("scenes").get();
  const withImage = scenes.docs.filter((s) => s.data().imageUrl).length;
  const withSpec = scenes.docs.filter((s) => s.data().sceneSpec?.reveal).length;
  const events = await d.ref.collection("events").get();
  console.log(`■ ${d.id}  [${p.status}]  "${(p.title || "").slice(0, 30)}"`);
  console.log(`   owner=${p.ownerId?.slice(0, 8)} len=${p.targetLength}s style=${p.stylePackId} voice=${p.voiceId}`);
  console.log(`   장면 ${scenes.size}개 (이미지 ${withImage} / sceneSpec ${withSpec})`);
  console.log(`   썸네일=${p.thumbnailUrl ? "있음" : "없음"}  영상=${p.videoUrl || p.outputUrl || p.mp4Url ? "있음" : "없음"}`);
  if (p.videoUrl || p.outputUrl || p.mp4Url) console.log(`   videoURL: ${(p.videoUrl || p.outputUrl || p.mp4Url).slice(0, 80)}`);
  console.log(`   costLog=${JSON.stringify(p.costLog ?? {})}`);
  console.log(`   creditHold=${p.creditHold ?? 0} settled=${p.creditSettled ?? false} countedFree=${p.countedFree ?? false}  events=${events.size}건`);
  console.log("");
}
process.exit(0);
