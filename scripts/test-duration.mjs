// music-metadata 길이 측정 정확도 검증 — 기존 TTS 샘플 vs ffprobe
import { execFileSync } from "node:child_process";
import { parseBuffer } from "music-metadata";

const url = "https://storage.googleapis.com/golpo-b6407.firebasestorage.app/_test/tts-sample.mp3";
const res = await fetch(url);
const buffer = Buffer.from(await res.arrayBuffer());

// 1. music-metadata (새 TTS 라우트 방식)
const meta = await parseBuffer(buffer, { mimeType: "audio/mpeg" });
console.log("music-metadata:", meta.format.duration?.toFixed(2), "초");

// 2. ffprobe (Worker 방식 — 기준값)
import { writeFileSync, rmSync } from "node:fs";
writeFileSync("scripts/_dur_test.mp3", buffer);
const out = execFileSync(
  "C:\\Users\\funjeju\\tools\\ffmpeg-8.1.1-essentials_build\\bin\\ffprobe.exe",
  ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", "scripts/_dur_test.mp3"],
  { encoding: "utf-8" }
);
rmSync("scripts/_dur_test.mp3");
console.log("ffprobe      :", parseFloat(out).toFixed(2), "초");

const old = Math.max(45 / 150, 2);
console.log("기존 공식(버그):", old.toFixed(2), "초  ← 이만큼 어긋나고 있었음");
