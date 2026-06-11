// Firestore 복합 인덱스 프로그래매틱 생성 (Firestore Admin REST API)
import { readFileSync } from "node:fs";
import { GoogleAuth } from "google-auth-library";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const sa = JSON.parse(env.FIREBASE_ADMIN_SA_KEY);
const auth = new GoogleAuth({
  credentials: sa,
  scopes: ["https://www.googleapis.com/auth/datastore"],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();

const base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/collectionGroups`;

const indexes = [
  {
    collection: "projects",
    fields: [
      { fieldPath: "ownerId", order: "ASCENDING" },
      { fieldPath: "createdAt", order: "DESCENDING" },
    ],
  },
  {
    collection: "renderJobs",
    fields: [
      { fieldPath: "projectId", order: "ASCENDING" },
      { fieldPath: "createdAt", order: "DESCENDING" },
    ],
  },
];

for (const idx of indexes) {
  const res = await fetch(`${base}/${idx.collection}/indexes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      queryScope: "COLLECTION",
      fields: idx.fields,
    }),
  });
  const data = await res.json();
  if (res.ok) {
    console.log(`✅ ${idx.collection} 인덱스 생성 시작:`, data.name?.split("/operations/")[1] ?? "");
  } else if (data.error?.status === "ALREADY_EXISTS") {
    console.log(`✅ ${idx.collection} 인덱스 이미 존재`);
  } else {
    console.log(`❌ ${idx.collection} 실패:`, data.error?.message);
  }
}

console.log("\n인덱스 빌드는 보통 1~5분 소요. test-indexes.mjs로 재확인 가능.");
process.exit(0);
