// 큐 경로 검증: Vercel /api/render와 동일하게 Cloud Tasks에 enqueue → 폴링.
// 사용법: node scripts/queue-test.mjs <projectId> [projectId2 ...]
// 여러 개 주면 동시에 enqueue해 병렬 인스턴스 분리를 확인.
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { CloudTasksClient } from "@google-cloud/tasks";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sa = JSON.parse(process.env.FIREBASE_ADMIN_SA_KEY);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const PROJECT = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.CLOUD_TASKS_LOCATION;
const QUEUE = process.env.CLOUD_TASKS_QUEUE;
const WORKER = process.env.RENDER_WORKER_URL;
const SECRET = process.env.WORKER_SECRET;

const tasks = new CloudTasksClient({
  projectId: PROJECT,
  credentials: { client_email: sa.client_email, private_key: sa.private_key },
});
const parent = tasks.queuePath(PROJECT, LOCATION, QUEUE);

const pids = process.argv.slice(2);
if (pids.length === 0) { console.log("usage: node scripts/queue-test.mjs <projectId> [..]"); process.exit(1); }

const jobs = [];
for (const pid of pids) {
  const proj = await db.collection("projects").doc(pid).get();
  if (!proj.exists) { console.log("NO PROJECT:", pid); continue; }
  const jobRef = await db.collection("renderJobs").add({
    projectId: pid, ownerId: proj.data().ownerId, type: "full", status: "queued", progress: 0,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  await tasks.createTask({
    parent,
    task: {
      dispatchDeadline: { seconds: 1800 },
      httpRequest: {
        httpMethod: "POST",
        url: `${WORKER}/render`,
        headers: { "Content-Type": "application/json", ...(SECRET ? { "x-worker-secret": SECRET } : {}) },
        body: Buffer.from(JSON.stringify({ jobId: jobRef.id, projectId: pid })).toString("base64"),
      },
    },
  });
  jobs.push({ pid, jobId: jobRef.id });
  console.log("enqueued:", pid, "→ job", jobRef.id);
}

const start = Date.now();
const done = new Set();
while (Date.now() - start < 600000 && done.size < jobs.length) {
  await new Promise((r) => setTimeout(r, 5000));
  const t = Math.round((Date.now() - start) / 1000);
  for (const j of jobs) {
    if (done.has(j.jobId)) continue;
    const d = (await db.collection("renderJobs").doc(j.jobId).get()).data();
    if (d.status === "done") { console.log(`[${t}s] ${j.pid} DONE (renderSeconds=${d.costLog?.renderSeconds ?? "?"})`); done.add(j.jobId); }
    else if (d.status === "error") { console.log(`[${t}s] ${j.pid} ERROR: ${d.error ?? "?"}`); done.add(j.jobId); }
    else if (d.status === "cancelled") { console.log(`[${t}s] ${j.pid} CANCELLED`); done.add(j.jobId); }
    else console.log(`[${t}s] ${j.pid} ${d.status} ${d.progress ?? 0}%`);
  }
}
console.log("=== finished:", done.size, "/", jobs.length, "in", Math.round((Date.now() - start) / 1000), "s ===");
process.exit(0);
