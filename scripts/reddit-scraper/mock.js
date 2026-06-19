require("dotenv").config({ path: "../../.env.local" });
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

if (!process.env.FIREBASE_ADMIN_SA_KEY) throw new Error("Missing FIREBASE_ADMIN_SA_KEY");
const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SA_KEY);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function runMock() {
  const topics = [
    {
      id: "배달_새벽배송",
      topic: "배달",
      subtopic: "새벽배송",
      appear_count: 812,
      first_seen: "2021-05-12",
      last_seen: "2026-06-19",
      platforms: ["r/korea", "r/Living_in_Korea"],
      recent_growth_rate: 21,
      status: "OFFICIAL"
    },
    {
      id: "치안_카페노트북",
      topic: "치안",
      subtopic: "카페노트북방치",
      appear_count: 533,
      first_seen: "2020-01-10",
      last_seen: "2026-06-18",
      platforms: ["r/Seoul", "r/korea"],
      recent_growth_rate: -5,
      status: "DRAFT"
    },
    {
      id: "교통_지하철환승",
      topic: "교통",
      subtopic: "지하철무료환승",
      appear_count: 345,
      first_seen: "2022-11-20",
      last_seen: "2026-06-15",
      platforms: ["r/koreatravel"],
      recent_growth_rate: 42,
      status: "DRAFT"
    }
  ];

  for (const t of topics) {
    const { id, ...data } = t;
    await db.collection("reddit_topics").doc(id).set(data);
    console.log("Mocked", id);
  }
  console.log("Done");
}

runMock();
