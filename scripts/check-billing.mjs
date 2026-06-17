import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const sa = JSON.parse(process.env.FIREBASE_ADMIN_SA_KEY);
initializeApp({ credential: cert(sa) });
const db = getFirestore();

console.log("=== 구독/크레딧 있는 사용자 ===");
const users = await db.collection("users").get();
users.forEach((d) => {
  const u = d.data();
  if (u.subscription || (u.credits ?? 0) > 0) {
    console.log(d.id, { email: u.email, credits: u.credits, plan: u.plan, subscription: u.subscription });
  }
});

console.log("\n=== 최근 결제 기록(payments) ===");
const pays = await db.collection("payments").orderBy("createdAt", "desc").limit(8).get();
if (pays.empty) console.log("(없음)");
pays.forEach((d) => console.log(d.id, d.data()));

process.exit(0);
