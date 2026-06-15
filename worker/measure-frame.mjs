// 프레임당 시간 분해: renderSceneFrame vs PNG인코딩 vs raw추출
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createCanvas, loadImage, ImageData } from "@napi-rs/canvas";
import { configureCanvasBackend, renderSceneFrame, ASPECT_SIZES } from "./dist/render-engine/renderCore.js";

const env = readFileSync("../.env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_ADMIN_SA_KEY)) });
const db = getFirestore();
configureCanvasBackend({ createCanvas, ImageData });

const pid = process.argv[2] ?? "yPnz64wkmJi1XVXUFLls";
const scenes = await db.collection("projects").doc(pid).collection("scenes").orderBy("order").get();
const s = scenes.docs[0].data();
const spec = s.sceneSpec;
const imageUrl = s.imageUrl || spec?.image?.url;
const resp = await fetch(imageUrl);
const { writeFileSync } = await import("node:fs");
writeFileSync("_m.png", Buffer.from(await resp.arrayBuffer()));
const img = await loadImage("_m.png");

const size = ASPECT_SIZES[spec.canvas?.aspect ?? "9:16"];
const canvas = createCanvas(size.width, size.height);
const ctx = canvas.getContext("2d");
const dur = s.durationSec || 4;
const FPS = 30;
const frameCount = Math.max(1, Math.ceil(dur * FPS));

let tRender = 0, tPng = 0, tRaw = 0;
// 워밍업 1프레임(분석 캐시 채움)
ctx.clearRect(0, 0, size.width, size.height);
renderSceneFrame(ctx, spec, img, 0, size, {});
canvas.toBuffer("image/png");

for (let i = 0; i < frameCount; i++) {
  const t = i / FPS;
  let a = Date.now();
  ctx.clearRect(0, 0, size.width, size.height);
  renderSceneFrame(ctx, spec, img, t, size, {});
  tRender += Date.now() - a;
  a = Date.now();
  canvas.toBuffer("image/png");
  tPng += Date.now() - a;
  a = Date.now();
  try { canvas.data(); } catch { canvas.toBuffer("raw"); }
  tRaw += Date.now() - a;
}
const n = frameCount;
console.log(`frames=${n} (dur ${dur}s, ${size.width}x${size.height})`);
console.log(`  renderSceneFrame: ${(tRender/n).toFixed(0)}ms/frame  (total ${(tRender/1000).toFixed(1)}s)`);
console.log(`  toBuffer(png):    ${(tPng/n).toFixed(0)}ms/frame  (total ${(tPng/1000).toFixed(1)}s)`);
console.log(`  raw extract:      ${(tRaw/n).toFixed(0)}ms/frame  (total ${(tRaw/1000).toFixed(1)}s)`);
console.log(`  => render+png = ${((tRender+tPng)/n).toFixed(0)}ms/frame (현재 방식)`);
console.log(`  => render+raw = ${((tRender+tRaw)/n).toFixed(0)}ms/frame (파이프 방식, ffmpeg 병렬 가정시 체감 ≈ render만)`);
process.exit(0);
