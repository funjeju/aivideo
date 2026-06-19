
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
require("dotenv").config({ path: ".env.local" });

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
const { cert } = require("firebase-admin/app");

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const ref = db.collection("test").doc("merge-test");
  await ref.set({ presets: { a: 1, b: 2 } });
  
  // Test merge: true behavior
  await ref.set({ presets: { c: 3 } }, { merge: true });
  
  const snap = await ref.get();
  console.log("After merge:", snap.data());
}
run().catch(console.error);

