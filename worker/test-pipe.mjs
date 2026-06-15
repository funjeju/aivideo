// 로컬 파이프 렌더 검증: scene 1을 raw RGBA → ffmpeg stdin 파이프로 _piped.mp4 생성
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
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

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FPS = 30;
const pid = process.argv[2] ?? "yPnz64wkmJi1XVXUFLls";
const scenes = await db.collection("projects").doc(pid).collection("scenes").orderBy("order").get();
const s = scenes.docs[0].data();
const spec = s.sceneSpec;
const imageUrl = s.imageUrl || spec?.image?.url;
const resp = await fetch(imageUrl);
writeFileSync("_p_src.png", Buffer.from(await resp.arrayBuffer()));
const img = await loadImage("_p_src.png");

const size = ASPECT_SIZES[spec.canvas?.aspect ?? "9:16"];
const canvas = createCanvas(size.width, size.height);
const ctx = canvas.getContext("2d");
const dur = s.durationSec || 4;
const frameCount = Math.max(1, Math.ceil(dur * FPS));

// 무음 오디오(오디오 다운로드 없이 길이만 맞춤)
const audioPath = "_p_silence.mp3";
await new Promise((res, rej) => {
  const p = spawn(FFMPEG, ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(dur), audioPath]);
  p.on("close", (c) => (c === 0 ? res() : rej(new Error("silence " + c))));
});

const ff = spawn(FFMPEG, [
  "-y", "-f", "rawvideo", "-pixel_format", "rgba",
  "-video_size", `${size.width}x${size.height}`, "-framerate", String(FPS),
  "-i", "pipe:0", "-i", audioPath,
  "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p", "-r", String(FPS),
  "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-shortest", "_piped.mp4",
]);
let ffErr = "";
ff.stderr.on("data", (d) => (ffErr += d));
ff.stdin.on("error", () => {});
const ffDone = new Promise((resolve, reject) => {
  ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg " + code + ": " + ffErr.slice(-600)))));
  ff.on("error", reject);
});

const t0 = Date.now();
for (let i = 0; i < frameCount; i++) {
  const t = i / FPS;
  ctx.clearRect(0, 0, size.width, size.height);
  renderSceneFrame(ctx, spec, img, t, size, {});
  const frame = Buffer.from(canvas.data());
  if (!ff.stdin.write(frame)) await new Promise((r) => ff.stdin.once("drain", r));
}
ff.stdin.end();
await ffDone;
console.log(`PIPED render done: ${frameCount} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s (wall-clock, render+encode 병렬)`);
process.exit(0);
