import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import puppeteer from "puppeteer";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FPS = 30;
const RENDER_PAGE_URL = process.env.RENDER_PAGE_URL ?? "http://localhost:3000/render";
// 로컬 검증 시 PATH에 없으면 절대경로 지정 가능. Docker에선 PATH에 있어 기본값으로 충분.
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

/** ffmpeg/ffprobe child_process 래퍼 */
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
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const dur = parseFloat(out.trim());
  return isNaN(dur) ? 0 : dur;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

interface RenderResult {
  outputUrl: string;
  renderSeconds: number;
  frameCount: number;
}

/**
 * 메인 렌더: projectId의 모든 장면 → mp4.
 * @param onProgress 0~100 콜백
 */
export async function renderProject(
  projectId: string,
  onProgress?: (pct: number) => void
): Promise<RenderResult> {
  const startedAt = Date.now();
  const { db, storage } = admin();

  // 1. 프로젝트 + 장면 로드
  const projectSnap = await db.collection("projects").doc(projectId).get();
  if (!projectSnap.exists) throw new Error("project not found");

  const scenesSnap = await db
    .collection("projects").doc(projectId)
    .collection("scenes")
    .orderBy("order")
    .get();

  const rawScenes = scenesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>));
  if (rawScenes.length === 0) throw new Error("no scenes");

  const workDir = await mkdtemp(join(tmpdir(), `render-${projectId}-`));
  const framesDir = join(workDir, "frames");
  await mkdir(framesDir, { recursive: true });

  try {
    // 2. 오디오 다운로드 + 실제 길이 측정 → durationSec 보정
    const audioFiles: string[] = [];
    const specs = [];
    for (let i = 0; i < rawScenes.length; i++) {
      const s = rawScenes[i];
      const spec = (s.sceneSpec as Record<string, unknown>) ?? {};
      let durationSec = (s.durationSec as number) || (spec.durationSec as number) || 3;

      const audioUrl = (s.audioUrl as string) || (spec.audioUrl as string);
      const audioPath = join(workDir, `audio_${String(i).padStart(3, "0")}.mp3`);
      if (audioUrl) {
        await download(audioUrl, audioPath);
        const measured = await probeDuration(audioPath);
        if (measured > 0) durationSec = measured;
        audioFiles.push(audioPath);
      } else {
        // 무음 생성
        await run(FFMPEG, ["-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(durationSec), audioPath]);
        audioFiles.push(audioPath);
      }

      specs.push({
        ...spec,
        sceneId: s.id,
        order: s.order,
        narration: s.narration,
        durationSec,
        audioUrl,
        image: (s.imageUrl as string) ? { url: s.imageUrl, fit: "contain" } : spec.image,
      });
    }

    const total = specs.reduce((sum, s) => sum + (s.durationSec || 1), 0);
    const frameCount = Math.max(1, Math.ceil(total * FPS));

    // 3. Puppeteer로 렌더 페이지 열기
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.goto(RENDER_PAGE_URL, { waitUntil: "networkidle0" });

    // React hydration으로 window API가 붙을 때까지 대기
    await page.waitForFunction("typeof window.__loadScenes === 'function'", { timeout: 60000 });

    // 장면 주입 + 이미지 프리로드 대기
    await page.evaluate(async (injected: object[]) => {
      const w = window as unknown as { __loadScenes: (s: object[]) => Promise<unknown> };
      await w.__loadScenes(injected);
    }, specs as unknown as object[]);

    await page.waitForFunction("window.__renderReady === true", { timeout: 120000 });

    // 4. 프레임 캡처
    for (let i = 0; i < frameCount; i++) {
      const t = i / FPS;
      const dataUrl: string = await page.evaluate((tt: number) => {
        const w = window as unknown as { __seek: (t: number) => void; __getFrame: () => string };
        w.__seek(tt);
        return w.__getFrame();
      }, t);

      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      const framePath = join(framesDir, `frame_${String(i).padStart(6, "0")}.png`);
      await writeFile(framePath, Buffer.from(base64, "base64"));

      if (i % 10 === 0 && onProgress) {
        // 프레임 캡처 = 전체의 70%까지
        onProgress(Math.round((i / frameCount) * 70));
      }
    }

    await browser.close();

    // 5. 오디오 합치기 (concat demuxer)
    const listPath = join(workDir, "audio_list.txt");
    await writeFile(
      listPath,
      audioFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n")
    );
    const mergedAudio = join(workDir, "audio.mp3");
    await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", mergedAudio]);
    if (onProgress) onProgress(80);

    // 6. 프레임 + 오디오 → mp4
    const outPath = join(workDir, "out.mp4");
    await run(FFMPEG, [
      "-y",
      "-framerate", String(FPS),
      "-i", join(framesDir, "frame_%06d.png"),
      "-i", mergedAudio,
      "-c:v", "libx264",
      "-preset", "medium",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      outPath,
    ]);
    if (onProgress) onProgress(90);

    // 7. Storage 업로드
    const bucket = storage.bucket();
    const destPath = `projects/${projectId}/output/video_${Date.now()}.mp4`;
    await bucket.upload(outPath, {
      destination: destPath,
      metadata: { contentType: "video/mp4" },
    });
    const outFile = bucket.file(destPath);
    await outFile.makePublic();
    const outputUrl = `https://storage.googleapis.com/${bucket.name}/${destPath}`;

    if (onProgress) onProgress(100);
    const renderSeconds = (Date.now() - startedAt) / 1000;

    return { outputUrl, renderSeconds, frameCount };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
