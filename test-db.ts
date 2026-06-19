
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
db.collection("settings").doc("global").get().then(doc => console.log(JSON.stringify(doc.data(), null, 2))).catch(console.error);

