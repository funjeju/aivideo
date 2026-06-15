import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_ADMIN_SA_KEY)) });
const db = getFirestore();

const pid = process.argv[2];
const WORKER = process.argv[3] ?? "https://aivideo-render-worker-328519096392.asia-northeast3.run.app";

const proj = await db.collection("projects").doc(pid).get();
if (!proj.exists) { console.log("NO PROJECT"); process.exit(1); }
const ownerId = proj.data().ownerId;

const jobRef = await db.collection("renderJobs").add({
  projectId: pid, ownerId, type: "full", status: "queued", progress: 0,
  createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
});
console.log("job:", jobRef.id, "→ worker:", WORKER);

const res = await fetch(`${WORKER}/render`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jobId: jobRef.id, projectId: pid }),
});
console.log("worker trigger:", res.status, (await res.text()).slice(0, 200));

// 폴링 (최대 10분)
const start = Date.now();
let last = "";
while (Date.now() - start < 600000) {
  await new Promise((r) => setTimeout(r, 5000));
  const j = (await jobRef.get()).data();
  const line = `[${Math.round((Date.now() - start) / 1000)}s] status:${j.status} progress:${j.progress ?? 0}`;
  if (line !== last) { console.log(line); last = line; }
  if (j.status === "done") {
    const p = (await db.collection("projects").doc(pid).get()).data();
    console.log("DONE. outputUrl:", p.outputUrl);
    console.log("error:", j.error ?? "none");
    process.exit(0);
  }
  if (j.status === "error") { console.log("RENDER ERROR:", j.error ?? "(no detail)"); process.exit(1); }
}
console.log("TIMEOUT (10min)");
process.exit(1);
