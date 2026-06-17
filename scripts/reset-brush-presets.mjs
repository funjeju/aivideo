// 그래픽노블·유럽 그래픽노블: 흰배경 선화로 전환됨 → 큰 수채 와시 프리셋 제거(기본 펜 트레이스).
// cinematic-hype(풀씬 네온 유지)만 와시 프리셋 유지.
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const sa = JSON.parse(process.env.FIREBASE_ADMIN_SA_KEY);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

await db.collection("settings").doc("global").update({
  "presets.graphic-novel": FieldValue.delete(),
  "presets.euro-graphic-novel": FieldValue.delete(),
});
console.log("graphic-novel, euro-graphic-novel 브러시 프리셋 제거(기본 펜 복귀). cinematic-hype는 유지.");

const d = (await db.collection("settings").doc("global").get()).data();
console.log("남은 presets:", Object.keys(d.presets ?? {}));
process.exit(0);
