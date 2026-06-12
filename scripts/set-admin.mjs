// 특정 이메일 계정을 superadmin으로 승격 (Admin SDK — 규칙 우회)
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

initializeApp({ credential: cert(JSON.parse(env.FIREBASE_ADMIN_SA_KEY)) });
const auth = getAuth();
const db = getFirestore();

const email = process.argv[2] ?? "naggu1999@gmail.com";
const role = process.argv[3] ?? "superadmin";

const user = await auth.getUserByEmail(email);
console.log("대상:", email, "uid:", user.uid);

// 1. Custom Claims (서버 API 인증용 — lib/auth.ts가 token.role을 읽음)
await auth.setCustomUserClaims(user.uid, { role });
console.log("✅ Custom Claims role =", role);

// 2. users 문서 role (클라이언트 UI 권한 — admin layout이 userDoc.role을 읽음)
const ref = db.collection("users").doc(user.uid);
const snap = await ref.get();
if (snap.exists) {
  await ref.update({ role, updatedAt: FieldValue.serverTimestamp() });
} else {
  await ref.set({
    email,
    displayName: user.displayName ?? "",
    plan: "free",
    credits: 0,
    role,
    uiLocale: "ko",
    themePref: "light",
    createdAt: FieldValue.serverTimestamp(),
  });
}
console.log("✅ users 문서 role =", role);
console.log("\n주의: 브라우저에서 로그아웃 후 재로그인해야 반영됩니다 (토큰/userDoc 갱신).");
process.exit(0);
