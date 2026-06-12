/**
 * 렌더 코어 — 프레임워크 독립. 브라우저 프리뷰와 Cloud Run Worker(headless Chromium)가 공유.
 *
 * 드로잉 방식: "펜이 색칠"이 아니라 "가려진 원본을 펜 궤적으로 긁어내어 보여주기(Reveal)".
 * - 이미지의 엣지(소벨)를 따라 한붓그리기 경로(TSP)를 만들고
 * - 그 경로를 시간에 따라 펜이 따라가며 마스크에 흰 궤적을 누적
 * - destination-in 합성으로 펜이 지나간 자리만 원본이 나타남
 * - 가변 두께(sin) + 잉크 튐(dabs) + 펜 회전(atan2)으로 아날로그 느낌
 *
 * 결정적: 같은 SceneSpec + 같은 t → 같은 픽셀 (랜덤은 seeded).
 */
import { SceneSpec, RevealObject } from "@/lib/types";
import { createSeededRandom, hashSeed } from "./seededRandom";

export interface CanvasSize { width: number; height: number }

export const ASPECT_SIZES: Record<string, CanvasSize> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
};

const PAPER_COLORS: Record<string, string> = { white: "#FFFFFF", "paper-hanji": "#FAF8F4" };
const SRC_IMG_W = 1024;
const SRC_IMG_H = 1536;

type ImageSource = CanvasImageSource & { width: number; height: number };

interface RenderOptions {
  showHand?: boolean;
  brushSize?: number;
  brushCount?: number;
  brushSpeed?: number;
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function clamp01(x: number): number { return x < 0 ? 0 : x > 1 ? 1 : x; }

function computeFit(canvas: CanvasSize, img?: ImageSource) {
  const iw = img?.width ?? SRC_IMG_W;
  const ih = img?.height ?? SRC_IMG_H;
  const scale = Math.min(canvas.width / iw, canvas.height / ih);
  const drawW = iw * scale, drawH = ih * scale;
  return {
    scale, drawW, drawH,
    offsetX: (canvas.width - drawW) / 2,
    offsetY: (canvas.height - drawH) / 2,
    bScaleX: drawW / SRC_IMG_W,
    bScaleY: drawH / SRC_IMG_H,
  };
}

// ── 오프스크린 스크래치 캔버스 (성능) ──────────────────────────────
type Cv = { c: HTMLCanvasElement | null };
const _mask: Cv = { c: null };
const _masked: Cv = { c: null };
const _tmp: Cv = { c: null };
function scratch(ref: Cv, w: number, h: number): HTMLCanvasElement {
  if (!ref.c) ref.c = document.createElement("canvas");
  if (ref.c.width !== w) ref.c.width = w;
  if (ref.c.height !== h) ref.c.height = h;
  return ref.c;
}

// ── 경로 생성 (엣지 디텍션 + TSP + 스무딩), 객체별 캐시 ────────────
interface Pt { x: number; y: number }
const pathCache = new Map<string, Pt[]>();

function computeDrawPath(image: ImageSource, obj: RevealObject, fit: ReturnType<typeof computeFit>): Pt[] {
  const key = `${obj.id}|${obj.bbox.join(",")}|${Math.round(fit.drawW)}x${Math.round(fit.drawH)}`;
  const hit = pathCache.get(key);
  if (hit) return hit;

  // 표시 좌표계 bbox
  const dispX = obj.bbox[0] * fit.bScaleX + fit.offsetX;
  const dispY = obj.bbox[1] * fit.bScaleY + fit.offsetY;
  const dispW = (obj.bbox[2] - obj.bbox[0]) * fit.bScaleX;
  const dispH = (obj.bbox[3] - obj.bbox[1]) * fit.bScaleY;

  // 원본 이미지 픽셀 좌표계 bbox
  const ax = (obj.bbox[0] / SRC_IMG_W) * image.width;
  const ay = (obj.bbox[1] / SRC_IMG_H) * image.height;
  const aw = ((obj.bbox[2] - obj.bbox[0]) / SRC_IMG_W) * image.width;
  const ah = ((obj.bbox[3] - obj.bbox[1]) / SRC_IMG_H) * image.height;

  // 다운샘플 (긴 변 ~160px)
  const DS = 160;
  const s = Math.min(DS / Math.max(aw, 1), DS / Math.max(ah, 1), 1);
  const dw = Math.max(8, Math.round(aw * s));
  const dh = Math.max(8, Math.round(ah * s));

  const rnd = createSeededRandom(hashSeed(key));
  let points: Pt[] = [];

  try {
    const tmp = scratch(_tmp, dw, dh);
    const tctx = tmp.getContext("2d", { willReadFrequently: true })!;
    tctx.clearRect(0, 0, dw, dh);
    tctx.drawImage(image, ax, ay, aw, ah, 0, 0, dw, dh);
    const { data } = tctx.getImageData(0, 0, dw, dh);

    // 그레이스케일
    const gray = new Float32Array(dw * dh);
    for (let i = 0; i < dw * dh; i++) {
      gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }

    // 소벨 엣지
    const edges: Pt[] = [];
    for (let y = 1; y < dh - 1; y++) {
      for (let x = 1; x < dw - 1; x++) {
        const gx =
          -gray[(y - 1) * dw + x - 1] - 2 * gray[y * dw + x - 1] - gray[(y + 1) * dw + x - 1] +
           gray[(y - 1) * dw + x + 1] + 2 * gray[y * dw + x + 1] + gray[(y + 1) * dw + x + 1];
        const gy =
          -gray[(y - 1) * dw + x - 1] - 2 * gray[(y - 1) * dw + x] - gray[(y - 1) * dw + x + 1] +
           gray[(y + 1) * dw + x - 1] + 2 * gray[(y + 1) * dw + x] + gray[(y + 1) * dw + x + 1];
        const mag = Math.sqrt(gx * gx + gy * gy);
        if (mag > 90) edges.push({ x, y });
      }
    }

    // 그리드 셀당 점 1개로 양자화 — 같은 곳을 뭉쳐 칠하는 중복 제거
    const cell = 3; // 다운샘플 px 단위 셀
    const cols = Math.ceil(dw / cell);
    const seen = new Set<number>();
    let pts: Pt[] = [];
    for (const p of edges) {
      const key = Math.floor(p.y / cell) * cols + Math.floor(p.x / cell);
      if (!seen.has(key)) { seen.add(key); pts.push(p); }
    }

    // 빈 셀(아직 안 칠해질 여백)에만 노이즈 — 고르게 채우기
    for (let gy = 0; gy < dh; gy += cell) {
      for (let gx = 0; gx < dw; gx += cell) {
        const key = Math.floor(gy / cell) * cols + Math.floor(gx / cell);
        if (!seen.has(key) && rnd() < 0.06) {
          seen.add(key);
          pts.push({ x: gx + cell / 2, y: gy + cell / 2 });
        }
      }
    }

    // 점이 너무 적으면(빈 그림) 균등 그리드 보강
    if (pts.length < 6) {
      for (let y = 2; y < dh; y += 5) for (let x = 2; x < dw; x += 5) pts.push({ x, y });
    }

    // 너무 많으면 솎아내기 (성능)
    const MAX = 420;
    if (pts.length > MAX) {
      const step = pts.length / MAX;
      const reduced: Pt[] = [];
      for (let i = 0; i < pts.length; i += step) reduced.push(pts[Math.floor(i)]);
      pts = reduced;
    }

    // TSP 최근접 이웃 (좌상단 시작)
    const ordered: Pt[] = [];
    const used = new Array(pts.length).fill(false);
    let cur = 0;
    // 시작점: 가장 위(작은 y)
    for (let i = 1; i < pts.length; i++) if (pts[i].y < pts[cur].y) cur = i;
    used[cur] = true; ordered.push(pts[cur]);
    for (let k = 1; k < pts.length; k++) {
      let best = -1, bestD = Infinity;
      const p = pts[cur];
      for (let i = 0; i < pts.length; i++) {
        if (used[i]) continue;
        const d = (pts[i].x - p.x) ** 2 + (pts[i].y - p.y) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) break;
      used[best] = true; ordered.push(pts[best]); cur = best;
    }

    // 다운샘플 → 표시 좌표
    const scaled = ordered.map((p) => ({ x: dispX + (p.x / dw) * dispW, y: dispY + (p.y / dh) * dispH }));

    // 이동 평균 스무딩
    const sm: Pt[] = [];
    const W = 2;
    for (let i = 0; i < scaled.length; i++) {
      let sx = 0, sy = 0, n = 0;
      for (let j = Math.max(0, i - W); j <= Math.min(scaled.length - 1, i + W); j++) { sx += scaled[j].x; sy += scaled[j].y; n++; }
      sm.push({ x: sx / n, y: sy / n });
    }
    points = sm;
  } catch {
    // CORS tainted 등 → bbox 내 지그재그 폴백
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const y = dispY + (dispH * r) / (rows - 1);
      if (r % 2 === 0) { points.push({ x: dispX, y }); points.push({ x: dispX + dispW, y }); }
      else { points.push({ x: dispX + dispW, y }); points.push({ x: dispX, y }); }
    }
  }

  pathCache.set(key, points);
  return points;
}

// ── 펜 ─────────────────────────────────────────────────────────
function drawHand(ctx: CanvasRenderingContext2D, pos: Pt, angle: number, tool: string, scale: number) {
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(angle + Math.PI / 2); // 진행 방향으로 펜을 눕힘
  const len = 90 * scale;
  const grad = ctx.createLinearGradient(0, 0, 0, len);
  if (tool === "brush") { grad.addColorStop(0, "#2A2A2E"); grad.addColorStop(1, "#8a5a2b"); }
  else if (tool === "marker") { grad.addColorStop(0, "#1e1e22"); grad.addColorStop(1, "#444"); }
  else { grad.addColorStop(0, "#e8e0d0"); grad.addColorStop(1, "#cbbf9a"); }
  const bw = 6 * scale;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-bw, 8 * scale); ctx.lineTo(bw, 8 * scale);
  ctx.lineTo(bw * 0.66, len); ctx.lineTo(-bw * 0.66, len);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#2A2A2E";
  ctx.beginPath();
  ctx.moveTo(-3 * scale, 0); ctx.lineTo(3 * scale, 0); ctx.lineTo(0, 10 * scale);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** 마스크에 경로 0..count 까지 가변 두께 + 잉크 튐으로 긋기 (흰색) */
function strokePathOnMask(
  mctx: CanvasRenderingContext2D, path: Pt[], count: number, baseW: number, seed: number
) {
  if (count < 1 || path.length < 2) {
    if (path.length) { mctx.fillStyle = "#fff"; mctx.beginPath(); mctx.arc(path[0].x, path[0].y, baseW / 2, 0, Math.PI * 2); mctx.fill(); }
    return;
  }
  const rnd = createSeededRandom(seed);
  mctx.strokeStyle = "#fff";
  mctx.fillStyle = "#fff";
  mctx.lineCap = "round";
  mctx.lineJoin = "round";
  // 잉크 번짐 — 마스크 가장자리를 부드럽게 (destination-in 시 원본이 페이드되며 나타남)
  mctx.shadowColor = "#fff";
  mctx.shadowBlur = baseW * 0.55;
  const n = Math.min(count, path.length - 1);
  const fade = 12; // 펜 끝 최근 구간은 옅게 시작 → 점점 진해짐 (끊김 방지)
  for (let i = 1; i <= n; i++) {
    const p0 = path[i - 1], p1 = path[i];
    // 동적 두께 (사인 압력 시뮬레이션)
    const w = baseW * (0.75 + 0.45 * (0.5 + 0.5 * Math.sin(i * 0.35)));
    mctx.lineWidth = w;
    mctx.globalAlpha = i > n - fade ? Math.max(0.08, (n - i) / fade) : 1;
    mctx.beginPath();
    mctx.moveTo(p0.x, p0.y);
    mctx.lineTo(p1.x, p1.y);
    mctx.stroke();
    // 잉크 튐 (dabs)
    if (rnd() < 0.5) {
      const r = baseW * (0.2 + rnd() * 0.45);
      mctx.globalAlpha = 0.5 + rnd() * 0.5;
      mctx.beginPath();
      mctx.arc(p1.x + (rnd() - 0.5) * baseW, p1.y + (rnd() - 0.5) * baseW, r, 0, Math.PI * 2);
      mctx.fill();
    }
  }
  mctx.globalAlpha = 1;
  mctx.shadowBlur = 0;
}

export function renderSceneFrame(
  ctx: CanvasRenderingContext2D,
  scene: SceneSpec,
  image: ImageSource | undefined,
  t: number,
  canvasSize: CanvasSize,
  opts: RenderOptions = {}
): void {
  const { width, height } = canvasSize;
  const paper = PAPER_COLORS[scene.canvas?.background] ?? "#FAF8F4";

  ctx.save();
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  const cam = interpolateCamera(scene.camera, t);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-width / 2 - cam.x, -height / 2 - cam.y);

  const fit = computeFit(canvasSize, image);

  if (image) {
    const objects = (scene.reveal?.objects ?? []).filter((o) => o.bbox);
    const brushSize = scene.hand?.size ?? opts.brushSize ?? 1;
    const brushCount = Math.max(1, Math.round(scene.hand?.count ?? opts.brushCount ?? 1));
    const brushSpeed = Math.max(0.2, scene.hand?.speed ?? opts.brushSpeed ?? 1);
    const baseW = Math.max(10, 42 * brushSize) * (height / 1920);

    const maxEnd = objects.length
      ? Math.max(...objects.map((o) => o.endAt ?? 0))
      : Math.max(scene.durationSec * 0.85, 0.5);

    if (objects.length === 0) {
      // 객체 없음 → 좌→우 점진 (폴백)
      const w = fit.drawW * ease(clamp01(t / maxEnd));
      ctx.save(); ctx.beginPath(); ctx.rect(fit.offsetX, fit.offsetY, w, fit.drawH); ctx.clip();
      ctx.drawImage(image, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH); ctx.restore();
    } else if (t >= maxEnd) {
      ctx.drawImage(image, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH); // 완성본
    } else {
      // 마스킹 reveal
      const mask = scratch(_mask, width, height);
      const mctx = mask.getContext("2d")!;
      mctx.clearRect(0, 0, width, height);

      const pens: { pos: Pt; angle: number }[] = [];
      for (const obj of objects) {
        const start = obj.startAt ?? 0;
        const end = obj.endAt ?? start + 1;
        // 속도: 그리기 진행 배속 (빠르면 일찍 완성하고 완성본 유지)
        const prog = clamp01(((t - start) / Math.max(end - start, 0.01)) * brushSpeed);
        if (prog <= 0) continue;
        const path = computeDrawPath(image, obj, fit);
        const eased = ease(prog);

        // 붓 개수: 경로를 N등분해 동시에 여러 펜이 각 구간을 그림
        const seg = Math.ceil(path.length / brushCount);
        for (let c = 0; c < brushCount; c++) {
          const s0 = c * seg;
          if (s0 >= path.length) break;
          const sub = path.slice(s0, Math.min(path.length, (c + 1) * seg + 1));
          if (sub.length < 1) continue;
          const cnt = Math.max(1, Math.floor(sub.length * eased));
          strokePathOnMask(mctx, sub, cnt, baseW, hashSeed(obj.id + ":" + c));
          if (prog < 1 && sub.length >= 2) {
            const idx = Math.min(cnt, sub.length - 1);
            const pos = sub[idx];
            const prev = sub[Math.max(0, idx - 1)];
            pens.push({ pos, angle: Math.atan2(pos.y - prev.y, pos.x - prev.x) });
          }
        }
      }

      // masked = 원본 ∩ 마스크 (destination-in)
      const masked = scratch(_masked, width, height);
      const xctx = masked.getContext("2d")!;
      xctx.clearRect(0, 0, width, height);
      xctx.drawImage(image, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH);
      xctx.globalCompositeOperation = "destination-in";
      xctx.drawImage(mask, 0, 0);
      xctx.globalCompositeOperation = "source-over";

      ctx.drawImage(masked, 0, 0);

      if (opts.showHand !== false && scene.hand?.enabled) {
        const penScale = Math.max(0.6, brushSize) * (height / 1920) * 1.2;
        for (const pen of pens) drawHand(ctx, pen.pos, pen.angle, scene.hand.asset, penScale);
      }
    }
  }

  ctx.restore();

  for (const ov of scene.overlays ?? []) {
    if (ov.type === "texture" && ov.opacity) {
      ctx.save();
      ctx.globalAlpha = ov.opacity * 0.4;
      ctx.fillStyle = "#d9cdb0";
      ctx.globalCompositeOperation = "multiply";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }
}

function interpolateCamera(camera: SceneSpec["camera"], t: number): { scale: number; x: number; y: number } {
  if (!camera || camera.length === 0) return { scale: 1, x: 0, y: 0 };
  if (camera.length === 1) { const k = camera[0]; return { scale: k.scale, x: k.x, y: k.y }; }
  let prev = camera[0], next = camera[camera.length - 1];
  for (let i = 0; i < camera.length - 1; i++) {
    if (t >= camera[i].at && t <= camera[i + 1].at) { prev = camera[i]; next = camera[i + 1]; break; }
  }
  const span = next.at - prev.at;
  const p = span <= 0 ? 0 : ease(clamp01((t - prev.at) / span));
  return {
    scale: prev.scale + (next.scale - prev.scale) * p,
    x: prev.x + (next.x - prev.x) * p,
    y: prev.y + (next.y - prev.y) * p,
  };
}

export interface TimelineEntry { scene: SceneSpec; startTime: number; endTime: number }

export function buildTimeline(scenes: SceneSpec[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let cursor = 0;
  for (const scene of scenes) {
    const dur = scene.durationSec || 1;
    entries.push({ scene, startTime: cursor, endTime: cursor + dur });
    cursor += dur;
  }
  return entries;
}

export function totalDuration(scenes: SceneSpec[]): number {
  return scenes.reduce((sum, s) => sum + (s.durationSec || 1), 0);
}

export function findSceneAt(timeline: TimelineEntry[], globalT: number): { entry: TimelineEntry; localT: number } | null {
  for (const entry of timeline) {
    if (globalT >= entry.startTime && globalT < entry.endTime) {
      return { entry, localT: globalT - entry.startTime };
    }
  }
  if (timeline.length > 0 && globalT >= timeline[timeline.length - 1].endTime) {
    const last = timeline[timeline.length - 1];
    return { entry: last, localT: last.endTime - last.startTime };
  }
  return null;
}

export { createSeededRandom, hashSeed };
