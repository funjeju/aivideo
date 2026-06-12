import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = {};
for (const l of envText.split(/\r?\n/)) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
initializeApp({ credential: cert(JSON.parse(env.FIREBASE_ADMIN_SA_KEY)) });
const db = getFirestore();
const pid = process.argv[2] || "RjFqf67Qg6p2UzlgWCgl";

let last = "";
for (let i = 0; i < 120; i++) {
  const p = (await db.collection("projects").doc(pid).get()).data();
  const line = `${p.status} ${p.generateProgress ?? "-"}%`;
  if (line !== last) { console.log(new Date().toLocaleTimeString(), line); last = line; }
  if (p.status === "done" || p.status === "error") { console.log("DONE:", p.status); process.exit(0); }
  await new Promise((r) => setTimeout(r, 5000));
}
console.log("TIMEOUT still:", last);
process.exit(0);
