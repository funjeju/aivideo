import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createCanvas, loadImage, ImageData } from "@napi-rs/canvas";
import { configureCanvasBackend, renderSceneFrame, ASPECT_SIZES } from "./dist/render-engine/renderCore.js";

// 루트 .env.local에서 SA 키 로드 (diag.mjs와 동일 방식)
const env = readFileSync("../.env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_ADMIN_SA_KEY)) });
const db = getFirestore();

// @napi-rs/canvas 백엔드 주입
configureCanvasBackend({ createCanvas, ImageData });

const pid = process.argv[2] ?? "yPnz64wkmJi1XVXUFLls";
const scenes = await db.collection("projects").doc(pid).collection("scenes").orderBy("order").get();
const s = scenes.docs[0].data();
const spec = s.sceneSpec;
const imageUrl = s.imageUrl || spec?.image?.url;
console.log("scene #1 imageUrl:", imageUrl?.slice(0, 80));
console.log("objects:", spec?.reveal?.objects?.length, "durationSec:", s.durationSec);

const resp = await fetch(imageUrl);
const imgBuf = Buffer.from(await resp.arrayBuffer());
const fsm = await import("node:fs");
fsm.writeFileSync("_img.png", imgBuf);
const img = await loadImage("_img.png");
console.log("image loaded:", img.width, "x", img.height);

const size = ASPECT_SIZES[spec.canvas?.aspect ?? "9:16"];
const canvas = createCanvas(size.width, size.height);
const ctx = canvas.getContext("2d");

const dur = s.durationSec || 8;
// 중간 프레임 (드로잉 진행 중) + 끝 프레임 (완성)
for (const [label, t] of [["mid", dur * 0.5], ["end", dur * 0.98]]) {
  ctx.clearRect(0, 0, size.width, size.height);
  renderSceneFrame(ctx, spec, img, t, size, {});
  const fs = await import("node:fs");
  fs.writeFileSync(`poc-${label}.png`, canvas.toBuffer("image/png"));
  console.log(`wrote poc-${label}.png (t=${t.toFixed(2)})`);
}
process.exit(0);
