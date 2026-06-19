
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { adminDb } from "./src/lib/firebase/admin";

async function run() {
  const pSnapshot = await adminDb().collection("projects").orderBy("createdAt", "desc").limit(1).get();
  const p = pSnapshot.docs[0].data();
  console.log("Project Style:", p.stylePackId);
}
run().catch(console.error);

