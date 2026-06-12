import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import puppeteer, { Page } from "puppeteer";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FPS = 30;
const RENDER_PAGE_URL = process.env.RENDER_PAGE_URL ?? "http://localhost:3000/render";
const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

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
    .update(JSON.stringify({ spec, imageUrl, audioUrl, fps: FPS, v: 13 }))
    .digest("hex")
    .slice(0, 16);
}

/** 단일 장면 → 세그먼트 mp4 (프레임 캡처 + 오디오 합성) */
async function renderSegment(
  page: Page,
  spec: Record<string, unknown>,
  durationSec: number,
  audioPath: string,
  workDir: string,
  framesDir: string,
  outPath: string
): Promise<number> {
  // 페이지에 이 장면 하나만 주입
  await page.evaluate(async (injected: object[]) => {
    const w = window as unknown as { __loadScenes: (s: object[]) => Promise<unknown> };
    await w.__loadScenes(injected);
  }, [spec] as unknown as object[]);
  await page.waitForFunction("window.__renderReady === true", { timeout: 120000 });

  const frameCount = Math.max(1, Math.ceil(durationSec * FPS));
  for (let i = 0; i < frameCount; i++) {
    const t = i / FPS;
    const dataUrl: string = await page.evaluate((tt: number) => {
      const w = window as unknown as { __seek: (t: number) => void; __getFrame: () => string };
      w.__seek(tt);
      return w.__getFrame();
    }, t);
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    await writeFile(join(framesDir, `f_${String(i).padStart(6, "0")}.png`), Buffer.from(base64, "base64"));
  }

  // 프레임 + 오디오 → 세그먼트 mp4 (동일 인코딩으로 concat copy 가능)
  await run(FFMPEG, [
    "-y",
    "-framerate", String(FPS),
    "-i", join(framesDir, "f_%06d.png"),
    "-i", audioPath,
    "-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
    "-shortest", outPath,
  ]);
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
  const { db, storage } = admin();
  const bucket = storage.bucket();

  const scenesSnap = await db
    .collection("projects").doc(projectId)
    .collection("scenes").orderBy("order").get();
  const rawScenes = scenesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>));
  if (rawScenes.length === 0) throw new Error("no scenes");

  const workDir = await mkdtemp(join(tmpdir(), `render-${projectId}-`));
  const framesDir = join(workDir, "frames");
  await mkdir(framesDir, { recursive: true });

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  let reusedSegments = 0;
  let renderedSegments = 0;
  let totalFrames = 0;

  try {
    const segmentLocalPaths: string[] = [];
    const total = rawScenes.length;

    for (let i = 0; i < rawScenes.length; i++) {
      const s = rawScenes[i];
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
        await segFile.download({ destination: localSeg });
        reusedSegments++;
      } else {
        // 재렌더
        if (!browser) {
          browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
          });
        }
        const page = await browser.newPage();
        await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
        await page.goto(RENDER_PAGE_URL, { waitUntil: "networkidle0" });
        await page.waitForFunction("typeof window.__loadScenes === 'function'", { timeout: 60000 });

        // 프레임 디렉터리 비우고 재사용
        await rm(framesDir, { recursive: true, force: true });
        await mkdir(framesDir, { recursive: true });

        const fc = await renderSegment(page, fullSpec, durationSec, audioPath, workDir, framesDir, localSeg);
        totalFrames += fc;
        await page.close();

        // Storage 업로드 + 해시 기록
        await bucket.upload(localSeg, { destination: segStoragePath, metadata: { contentType: "video/mp4" } });
        await db.collection("projects").doc(projectId).collection("scenes").doc(s.id as string)
          .update({ segmentHash: hash });
        renderedSegments++;
      }

      segmentLocalPaths.push(localSeg);
      if (onProgress) onProgress(Math.round(((i + 1) / total) * 85));
    }

    if (browser) { await browser.close(); browser = null; }

    // 세그먼트 concat → 최종 mp4
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
    if (browser) await browser.close().catch(() => {});
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
