import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// .env.local 로드
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_ADMIN_SA_KEY)) });
const db = getFirestore();

const pid = process.argv[2];
const proj = await db.collection("projects").doc(pid).get();
if (!proj.exists) { console.log("NO PROJECT", pid); process.exit(0); }
const p = proj.data();
console.log("=== PROJECT ===");
console.log("status:", p.status, "| progress:", p.generateProgress, "| updatedAt:", p.updatedAt?.toDate?.());
console.log("costLog:", JSON.stringify(p.costLog ?? {}));

const scenes = await db.collection("projects").doc(pid).collection("scenes").orderBy("order").get();
console.log(`\n=== SCENES (${scenes.size}) ===`);
for (const d of scenes.docs) {
  const s = d.data();
  console.log(
    `#${s.order} img:${s.imageStatus ?? "-"} hasImg:${!!s.imageUrl} hasSpec:${!!s.sceneSpec?.reveal} dur:${s.durationSec ?? 0} narr:${(s.narration ?? "").length}자`
  );
}
process.exit(0);
