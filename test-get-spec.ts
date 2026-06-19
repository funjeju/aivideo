
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const pSnapshot = await db.collection("projects").orderBy("createdAt", "desc").limit(1).get();
  if (pSnapshot.empty) return console.log("No projects");
  const p = pSnapshot.docs[0];
  console.log("Project:", p.id, p.data().createdAt?.toDate());
  
  const segments = await p.ref.collection("segments").limit(1).get();
  if (segments.empty) return console.log("No segments");
  const seg = segments.docs[0].data();
  const spec = seg.sceneSpec;
  console.log("hand in spec:", spec?.hand);
}
run().catch(console.error);

