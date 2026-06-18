// 신규 무료회원 1편 생성 E2E (실제 과금·렌더). 사용:
//   node --env-file=.env.local scripts/e2e-test.mjs
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { readFileSync } from "node:fs";

const BASE = process.env.E2E_BASE || "https://easyshorts.net";
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const TOPIC = process.env.E2E_TOPIC || "물은 왜 위에서 아래로 흐를까?";
const STYLE = process.env.E2E_STYLE || "doodle-edu";
const VOICE = "kr-leda";

const sa = JSON.parse(process.env.FIREBASE_ADMIN_SA_KEY);
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const adminAuth = getAuth();

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function idTokenFor(uid) {
  const custom = await adminAuth.createCustomToken(uid);
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const d = await res.json();
  if (!d.idToken) throw new Error("idToken 발급 실패: " + JSON.stringify(d));
  return d.idToken;
}

async function api(path, token, body, { form = false, timeout = 120000 } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (form) { payload = body; } else { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body: payload, signal: AbortSignal.timeout(timeout) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}

async function createBareProject(uid, title) {
  const ref = await db.collection("projects").add({
    ownerId: uid, title, mode: "generate", targetLength: 60, aspect: "9:16",
    stylePackId: STYLE, voiceId: VOICE, status: "script_ready", scriptApproved: false,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

(async () => {
  const uid = `e2e_${Date.now()}`;
  log("테스트 유저 생성:", uid);
  await db.collection("users").doc(uid).set({
    email: `${uid}@e2e.test`, displayName: "E2E 테스터", plan: "free", credits: 0,
    role: "user", uiLocale: "ko", themePref: "light", createdAt: FieldValue.serverTimestamp(),
  });
  const token = await idTokenFor(uid);
  log("ID 토큰 발급 OK");

  // 1) 프로젝트 생성
  const fd = new FormData();
  fd.append("ownerId", uid); fd.append("mode", "generate"); fd.append("targetLength", "60");
  fd.append("aspect", "9:16"); fd.append("stylePackId", STYLE); fd.append("voiceId", VOICE);
  fd.append("contentLocale", "ko"); fd.append("topic", TOPIC);
  if (process.env.E2E_CHARREF) {
    const buf = readFileSync(process.env.E2E_CHARREF);
    fd.append("characterRef", new Blob([buf], { type: "image/png" }), "ref.png");
    log("캐릭터 참조 첨부:", process.env.E2E_CHARREF);
  }
  let r = await api("/api/projects", token, fd, { form: true });
  log("① /api/projects", r.status, JSON.stringify(r.json).slice(0, 120));
  const projectId = r.json.projectId;
  if (!projectId) throw new Error("프로젝트 생성 실패");

  // 2) 원고
  r = await api("/api/script", token, { projectId, mode: "generate", topic: TOPIC, targetLength: 60, contentLocale: "ko" }, { timeout: 120000 });
  log("② /api/script", r.status, JSON.stringify(r.json).slice(0, 120));

  const scenes = (await db.collection("projects").doc(projectId).collection("scenes").orderBy("order").get()).docs;
  log(`   장면 ${scenes.length}개 생성됨`);

  // 3) TTS (장면별)
  let ttsOk = 0;
  for (const s of scenes) {
    const narration = s.data().narration;
    if (!narration) continue;
    const t = await api("/api/tts", token, { projectId, sceneId: s.id, narration, voiceId: VOICE }, { timeout: 60000 });
    if (t.status === 200) ttsOk++;
  }
  log(`③ TTS ${ttsOk}/${scenes.length} 성공`);

  // 4) 승인 (무료캡 +1)
  r = await api("/api/approve", token, { projectId }, { timeout: 30000 });
  log("④ /api/approve", r.status, JSON.stringify(r.json).slice(0, 120));
  const u1 = (await db.collection("users").doc(uid).get()).data();
  log(`   freeVideosUsed = ${u1.freeVideosUsed} (기대 1)`);

  // 5) 생성 (이미지/비전/플래너) — 길다
  log("⑤ /api/generate 시작 (수분 소요)…");
  r = await api("/api/generate", token, { projectId }, { timeout: 600000 });
  log("⑤ /api/generate", r.status, JSON.stringify(r.json).slice(0, 120));

  // 6) 렌더 (큐 → 워커, 비동기) → 폴링
  r = await api("/api/render", token, { projectId }, { timeout: 60000 });
  log("⑥ /api/render(enqueue)", r.status, JSON.stringify(r.json).slice(0, 120));
  log("   렌더 완료 폴링…");
  let videoUrl = null;
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const p = (await db.collection("projects").doc(projectId).get()).data();
    const v = p.videoUrl || p.outputUrl || p.mp4Url;
    if (v) { videoUrl = v; break; }
    if (p.status === "error") { log("   렌더 상태 error"); break; }
    if (i % 6 === 0) log(`   …${i * 5}s status=${p.status}`);
  }

  // 7) 검증 요약
  const finalScenes = (await db.collection("projects").doc(projectId).collection("scenes").get()).docs;
  const withImg = finalScenes.filter((s) => s.data().imageUrl).length;
  const events = (await db.collection("projects").doc(projectId).collection("events").get()).size;
  const p = (await db.collection("projects").doc(projectId).get()).data();
  const mine = (await db.collection("projects").where("ownerId", "==", uid).get()).size;

  console.log("\n===== E2E 결과 =====");
  console.log("projectId :", projectId);
  console.log("status    :", p.status);
  console.log("캐릭터참조 :", p.characterRefUrl ? "저장됨 ✅" : "없음");
  console.log("장면 이미지:", `${withImg}/${finalScenes.length}`);
  console.log("썸네일    :", p.thumbnailUrl ? "있음" : "없음");
  console.log("영상 mp4  :", videoUrl ? "있음 ✅" : "없음 ❌");
  if (videoUrl) console.log("           ", videoUrl);
  console.log("costLog   :", JSON.stringify(p.costLog ?? {}));
  console.log("단계 로그 :", `${events}건`);
  console.log("마이페이지 쿼리(ownerId):", `${mine}개`);
  console.log("freeVideosUsed:", u1.freeVideosUsed);

  // 8) 무료캡 경계 — 더미 2개로 2편째 OK / 3편째 차단 확인
  log("⑦ 무료캡 경계 테스트…");
  const p2 = await createBareProject(uid, "[E2E] cap test 2");
  const a2 = await api("/api/approve", token, { projectId: p2 }, { timeout: 30000 });
  const p3 = await createBareProject(uid, "[E2E] cap test 3");
  const a3 = await api("/api/approve", token, { projectId: p3 }, { timeout: 30000 });
  console.log("2편째 approve:", a2.status, "(기대 200)");
  console.log("3편째 approve:", a3.status, JSON.stringify(a3.json), "(기대 403 free_limit)");

  console.log("\n테스트 유저:", uid, "(검토 후 삭제 가능)");
  process.exit(0);
})().catch((e) => { console.error("E2E 실패:", e); process.exit(1); });
