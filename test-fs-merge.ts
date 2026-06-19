
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { adminDb } from "./src/lib/firebase/admin";

async function run() {
  const ref = adminDb().collection("test").doc("merge-test");
  await ref.set({ presets: { a: 1, b: 2 } });
  
  // Test merge: true behavior
  await ref.set({ presets: { c: 3 } }, { merge: true });
  
  const snap = await ref.get();
  console.log("After merge:", snap.data());
}
run().catch(console.error);

