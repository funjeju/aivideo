// UI가 쓰는 복합 쿼리들이 인덱스 없이 실패하는지 검사
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

// 1. 대시보드 쿼리: projects where ownerId == X orderBy createdAt desc
try {
  await db.collection("projects")
    .where("ownerId", "==", "test-user")
    .orderBy("createdAt", "desc")
    .limit(5)
    .get();
  console.log("✅ projects(ownerId+createdAt) 쿼리 OK");
} catch (e) {
  console.log("❌ projects(ownerId+createdAt) 실패:", e.message.split("\n")[0]);
}

// 2. renderJobs 쿼리: where projectId == X orderBy createdAt desc
try {
  await db.collection("renderJobs")
    .where("projectId", "==", "eeBrHY7speXIUPNx5VFP")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  console.log("✅ renderJobs(projectId+createdAt) 쿼리 OK");
} catch (e) {
  console.log("❌ renderJobs(projectId+createdAt) 실패:", e.message.split("\n")[0]);
}

process.exit(0);
