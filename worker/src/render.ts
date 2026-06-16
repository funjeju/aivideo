import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { createCanvas, loadImage, ImageData } from "@napi-rs/canvas";
import { configureCanvasBackend, renderSceneFrame, ASPECT_SIZES } from "./render-engine/renderCore.js";
import type { SceneSpec } from "./render-engine/types.js";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 렌더 엔진에 @napi-rs/canvas 백엔드 주입 (Chrome 없이 node에서 직접 렌더)
configureCanvasBackend({
  createCanvas: (w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement,
  ImageData: ImageData as unknown as never,
});

const FPS = 30;
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

const T0 = Date.now();
function log(...args: unknown[]) {
  console.log(`[render +${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...args);
}

function admin() {
  if (getApps().length === 0) {
    const saKey = process.env.FIREBASE_ADMIN_SA_KEY;
    if (!saKey) throw new Error("FIREBASE_ADMIN_SA_KEY not set");
    initializeApp({
      credential: cert(JSON.parse(saKey)),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  }
  return { db: getFirestore(), storage: getStorage() };
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("close", (code) => {
      if (code === 0) resolve(stdout || stderr);
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-500)}`));
    });
    p.on("error", reject);
  });
}

async function probeDuration(file: string): Promise<number> {
  const out = await run(FFPROBE, [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ]);
  const dur = parseFloat(out.trim());
  return isNaN(dur) ? 0 : dur;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

interface RenderResult {
  outputUrl: string;
  renderSeconds: number;
  frameCount: number;
  reusedSegments: number;
  renderedSegments: number;
}

/** 장면 입력의 결정적 해시 — 바뀌면 세그먼트 재렌더 */
function sceneHash(spec: unknown, imageUrl: string, audioUrl: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ spec, imageUrl, audioUrl, fps: FPS, v: 31 }))
    .digest("hex")
    .slice(0, 16);
}

/** 단일 장면 → 세그먼트 mp4 (node-canvas 직접 렌더 + 오디오 합성) */
async function renderSegment(
  spec: Record<string, unknown>,
  durationSec: number,
  audioPath: string,
  framesDir: string,
  outPath: string
): Promise<number> {
  // 이미지 로드: @napi-rs loadImage는 buffer를 SVG로 오판하는 버그가 있어 임시파일 경유
  const imageUrl = (spec.image as { url?: string })?.url ?? "";
  let img: Awaited<ReturnType<typeof loadImage>> | null = null;
  if (imageUrl) {
    log("  image fetch start");
    const resp = await fetch(imageUrl);
    if (!resp.ok) throw new Error(`image fetch failed ${resp.status}: ${imageUrl}`);
    const srcPath = join(framesDir, "_src.png");
    await writeFile(srcPath, Buffer.from(await resp.arrayBuffer()));
    img = await loadImage(srcPath);
    log("  image loaded", img.width, "x", img.height);
  }

  const aspect = (spec.canvas as { aspect?: string })?.aspect ?? "9:16";
  const size = ASPECT_SIZES[aspect] ?? ASPECT_SIZES["9:16"];
  const canvas = createCanvas(size.width, size.height);
  const ctx = canvas.getContext("2d");

  const frameCount = Math.max(1, Math.ceil(durationSec * FPS));
  log(`  rendering ${frameCount} frames (${size.width}x${size.height}) → ffmpeg pipe...`);
  const frameT0 = Date.now();

  // PNG 인코딩(프레임당 ~180ms)이 렌더(~40ms)보다 4배 비싸다 → 프레임을 디스크에 PNG로
  // 안 쓰고 raw RGBA 픽셀을 ffmpeg stdin에 직접 파이프한다. ffmpeg(libx264)는 별도
  // 프로세스로 남는 vCPU에서 동시에 인코딩 → 렌더와 병렬. canvas.data()는 RGBA 순서.
  const ff = spawn(FFMPEG, [
    "-y",
    "-f", "rawvideo", "-pixel_format", "rgba",
    "-video_size", `${size.width}x${size.height}`, "-framerate", String(FPS),
    "-i", "pipe:0",
    "-i", audioPath,
    "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
    "-shortest", outPath,
  ]);
  let ffErr = "";
  ff.stderr.on("data", (d) => (ffErr += d));
  const ffDone = new Promise<void>((resolve, reject) => {
    ff.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${ffErr.slice(-600)}`))
    );
    ff.on("error", reject);
  });
  // stdin EPIPE 등은 close 핸들러의 종료코드로 잡는다 (여기서 throw하면 unhandled)
  ff.stdin.on("error", () => {});

  for (let i = 0; i < frameCount; i++) {
    const t = i / FPS;
    ctx.clearRect(0, 0, size.width, size.height);
    renderSceneFrame(
      ctx as unknown as CanvasRenderingContext2D,
      spec as unknown as SceneSpec,
      (img ?? undefined) as unknown as Parameters<typeof renderSceneFrame>[2],
      t,
      size,
      {},
    );
    // 복사 필수: stream.write는 버퍼 참조만 보관 → 다음 프레임이 같은 메모리를 덮어쓰면 오염
    const frame = Buffer.from(canvas.data());
    if (!ff.stdin.write(frame)) {
      await new Promise<void>((r) => ff.stdin.once("drain", r));
    }
    if (i === 0 || (i + 1) % 30 === 0) {
      log(`    frame ${i + 1}/${frameCount} (${((Date.now() - frameT0) / 1000).toFixed(1)}s)`);
    }
  }
  ff.stdin.end();
  await ffDone;
  log(`  segment encoded in ${((Date.now() - frameT0) / 1000).toFixed(1)}s`);
  return frameCount;
}

/**
 * 세그먼트 기반 렌더. 장면별로 해시를 비교해 변경된 장면만 재렌더,
 * 나머지는 Storage 캐시 세그먼트를 재사용한 뒤 concat → 최종 mp4.
 */
export async function renderProject(
  projectId: string,
  onProgress?: (pct: number) => void
): Promise<RenderResult> {
  const startedAt = Date.now();
  log("renderProject start", projectId);
  const { db, storage } = admin();
  const bucket = storage.bucket();
  log("admin ready, bucket:", bucket.name);

  const scenesSnap = await db
    .collection("projects").doc(projectId)
    .collection("scenes").orderBy("order").get();
  const rawScenes = scenesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>));
  if (rawScenes.length === 0) throw new Error("no scenes");
  log(`loaded ${rawScenes.length} scenes`);

  const workDir = await mkdtemp(join(tmpdir(), `render-${projectId}-`));
  const framesDir = join(workDir, "frames");
  await mkdir(framesDir, { recursive: true });

  let reusedSegments = 0;
  let renderedSegments = 0;
  let totalFrames = 0;

  try {
    const segmentLocalPaths: string[] = [];
    const total = rawScenes.length;

    for (let i = 0; i < rawScenes.length; i++) {
      const s = rawScenes[i];
      log(`scene ${i + 1}/${total} start (id ${s.id})`);
      const spec = ((s.sceneSpec as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      const imageUrl = (s.imageUrl as string) || ((spec.image as { url?: string })?.url ?? "");
      const audioUrl = (s.audioUrl as string) || (spec.audioUrl as string) || "";

      // 오디오 다운로드 + 실제 길이
      const audioPath = join(workDir, `a_${i}.mp3`);
      let durationSec = (s.durationSec as number) || (spec.durationSec as number) || 3;
      if (audioUrl) {
        await download(audioUrl, audioPath);
        const measured = await probeDuration(audioPath);
        if (measured > 0) durationSec = measured;
        log(`  audio ${durationSec.toFixed(1)}s`);
      } else {
        await run(FFMPEG, ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(durationSec), audioPath]);
      }

      const fullSpec = { ...spec, durationSec, audioUrl, image: imageUrl ? { url: imageUrl, fit: "contain" } : (spec.image ?? undefined) };
      const hash = sceneHash(fullSpec, imageUrl, audioUrl);
      const segStoragePath = `projects/${projectId}/segments/${s.id}.mp4`;
      const segFile = bucket.file(segStoragePath);
      const localSeg = join(workDir, `seg_${String(i).padStart(3, "0")}.mp4`);

      const cachedHash = s.segmentHash as string | undefined;
      const [segExists] = await segFile.exists();

      if (cachedHash === hash && segExists) {
        // 캐시 재사용
        log("  cache hit, downloading segment");
        await segFile.download({ destination: localSeg });
        reusedSegments++;
      } else {
        log("  cache miss, rendering segment");
        // 재렌더 (node-canvas 직접 렌더 — Chrome 불필요)
        await rm(framesDir, { recursive: true, force: true });
        await mkdir(framesDir, { recursive: true });

        const fc = await renderSegment(fullSpec, durationSec, audioPath, framesDir, localSeg);
        totalFrames += fc;

        // Storage 업로드 + 해시 기록
        log("  uploading segment to storage");
        await bucket.upload(localSeg, { destination: segStoragePath, metadata: { contentType: "video/mp4" } });
        await db.collection("projects").doc(projectId).collection("scenes").doc(s.id as string)
          .update({ segmentHash: hash });
        renderedSegments++;
        log("  segment done");
      }

      segmentLocalPaths.push(localSeg);
      if (onProgress) onProgress(Math.round(((i + 1) / total) * 85));
    }

    // 세그먼트 concat → 최종 mp4
    log("all segments done, concat...");
    const listPath = join(workDir, "segments.txt");
    await writeFile(listPath, segmentLocalPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));
    const outPath = join(workDir, "out.mp4");
    try {
      await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outPath]);
    } catch {
      // copy 실패 시 재인코딩 폴백
      await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", outPath]);
    }
    if (onProgress) onProgress(95);

    // 최종 업로드
    log("concat done, uploading final mp4");
    const destPath = `projects/${projectId}/output/video_${Date.now()}.mp4`;
    await bucket.upload(outPath, { destination: destPath, metadata: { contentType: "video/mp4" } });
    const outFile = bucket.file(destPath);
    await outFile.makePublic();
    const outputUrl = `https://storage.googleapis.com/${bucket.name}/${destPath}`;

    if (onProgress) onProgress(100);
    return {
      outputUrl,
      renderSeconds: (Date.now() - startedAt) / 1000,
      frameCount: totalFrames,
      reusedSegments,
      renderedSegments,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
