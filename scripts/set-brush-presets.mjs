// 풀씬 일러스트 화풍(그래픽노블 계열)의 브러시 프리셋을 "큰 붓+최대 번짐"으로 세팅.
// 가는 골격 획이 굵은 와시(wash)로 뭉쳐 멜팅 아티팩트를 가린다.
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(process.env.FIREBASE_ADMIN_SA_KEY);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

// brushSize(0.3~6), inkSpread(0~1), fillRange(0.1~1), brushType
const RICH = { brushSize: 4, inkSpread: 1, fillRange: 1, brushType: "watercolor" };
const STYLES = ["graphic-novel", "euro-graphic-novel", "cinematic-hype"];

const presets = {};
for (const id of STYLES) presets[id] = { ...RICH };

await db.collection("settings").doc("global").set({ presets }, { merge: true });
console.log("브러시 프리셋 적용:", STYLES.join(", "), "→", JSON.stringify(RICH));

// 확인
const d = (await db.collection("settings").doc("global").get()).data();
for (const id of STYLES) console.log(" ", id, JSON.stringify(d.presets?.[id]));
process.exit(0);
