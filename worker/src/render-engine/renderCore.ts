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
// worker 격리본 — 메인 src/lib/render/renderCore.ts의 복사본. 수정 시 양쪽 동기화 + sceneHash v 증가.
import { SceneSpec, RevealObject, BrushType } from "./types.js";
import { createSeededRandom, hashSeed } from "./seededRandom.js";

export interface CanvasSize { width: number; height: number }

export const ASPECT_SIZES: Record<string, CanvasSize> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
};

const PAPER_COLORS: Record<string, string> = { white: "#FFFFFF", "paper-hanji": "#FAF8F4" };
// bbox 좌표계: 정규화 0~1000 (이미지 왼쪽=0 오른쪽=1000, 위=0 아래=1000).
// 이미지의 실제 비율(9:16 생성본·16:9·1:1·임의 업로드)과 무관하게 비례 변환되므로 항상 정확.
const BBOX_NORM = 1000;
const SRC_IMG_W = 1024; // 이미지 없을 때 fit 폴백 비율용
const SRC_IMG_H = 1536;

type ImageSource = CanvasImageSource & { width: number; height: number };

interface RenderOptions {
  showHand?: boolean;
  brushSize?: number;
  brushCount?: number;
  brushSpeed?: number;
  brushType?: BrushType;
  /** 테스트용: 완성본으로 점프하지 않고 path 드로잉만 유지 */
  noFinalImage?: boolean;
  /** 디버그: 객체 bbox + 순번 + startAt 오버레이 */
  debugBoxes?: boolean;
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
    bScaleX: drawW / BBOX_NORM,
    bScaleY: drawH / BBOX_NORM,
  };
}

// ── 캔버스 백엔드 (브라우저=DOM 기본 / worker=@napi-rs/canvas 주입) ──
// configureCanvasBackend를 호출하지 않으면 브라우저 DOM을 그대로 사용한다(붓 테스트·프리뷰 무영향).
// worker(node)는 시작 시 @napi-rs/canvas의 createCanvas/ImageData를 주입한다.
type ImageDataCtor = { new (data: Uint8ClampedArray, w: number, h: number): ImageData };
let _createCanvas: (w: number, h: number) => HTMLCanvasElement = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
};
let _ImageData: ImageDataCtor = (typeof ImageData !== "undefined" ? (ImageData as unknown as ImageDataCtor) : (null as unknown as ImageDataCtor));

export function configureCanvasBackend(backend: {
  createCanvas: (w: number, h: number) => HTMLCanvasElement;
  ImageData: ImageDataCtor;
}) {
  _createCanvas = backend.createCanvas;
  _ImageData = backend.ImageData;
}

// ── 오프스크린 스크래치 캔버스 (성능) ──────────────────────────────
type Cv = { c: HTMLCanvasElement | null };
const _mask: Cv = { c: null };
const _masked: Cv = { c: null };
const _tmp: Cv = { c: null };
function scratch(ref: Cv, w: number, h: number): HTMLCanvasElement {
  if (!ref.c) ref.c = _createCanvas(w, h);
  if (ref.c.width !== w) ref.c.width = w;
  if (ref.c.height !== h) ref.c.height = h;
  return ref.c;
}

// ── 장면 기하: 골격(스켈레톤) 추출 → "획(stroke)" 단위 드로잉 ─────────
// 점구름 TSP가 아니라, 그림의 선 자체를 1px 골격으로 세선화하고 끝점에서부터
// 따라 걸어 폴리라인(획)으로 추출한다. 붓이 실제 선 위를 한 획씩 따라가므로
// 사람이 판서하듯 "슥슥" 그려진다. (VideoScribe/Golpo류 핵심 기법)
interface Pt { x: number; y: number }
interface SceneItem {
  obj: RevealObject;
  strokes: Pt[][];   // 그리는 순서의 획 목록 (펜 이동 최소화 정렬)
  lens: number[];    // 획별 길이(px)
  total: number;     // 총 획 길이
  region: HTMLCanvasElement | null; // 이 객체에 배정된 픽셀 영역 (채움 패스)
}
// 기하만 캐시 — obj(startAt/endAt)는 항상 현재 sceneSpec 값 사용
interface SceneGeo { strokes: Pt[][][]; lens: number[][]; totals: number[]; regions: (HTMLCanvasElement | null)[] }
const sceneGeoCache = new Map<string, SceneGeo>();

/** Zhang-Suen 세선화: 이진 잉크 마스크 → 1px 골격 */
function thinSkeleton(ink: Uint8Array, w: number, h: number): Uint8Array {
  const img = ink.slice();
  const toDel: number[] = [];
  for (let iter = 0; iter < 80; iter++) {
    let changed = false;
    for (let pass = 0; pass < 2; pass++) {
      toDel.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!img[i]) continue;
          const p2 = img[i - w], p3 = img[i - w + 1], p4 = img[i + 1], p5 = img[i + w + 1];
          const p6 = img[i + w], p7 = img[i + w - 1], p8 = img[i - 1], p9 = img[i - w - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          let A = 0;
          if (!p2 && p3) A++; if (!p3 && p4) A++; if (!p4 && p5) A++; if (!p5 && p6) A++;
          if (!p6 && p7) A++; if (!p7 && p8) A++; if (!p8 && p9) A++; if (!p9 && p2) A++;
          if (A !== 1) continue;
          if (pass === 0) { if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue; }
          else { if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue; }
          toDel.push(i);
        }
      }
      if (toDel.length) { changed = true; for (const i of toDel) img[i] = 0; }
    }
    if (!changed) break;
  }
  return img;
}

/** 골격을 끝점부터 따라 걸으며 획(폴리라인) 추출 — 직진 우선(사람 손처럼) */
function traceStrokes(skel: Uint8Array, w: number, h: number): Pt[][] {
  const NB = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  const deg = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!skel[i]) continue;
      let d = 0;
      for (const [dx, dy] of NB) if (skel[(y + dy) * w + x + dx]) d++;
      deg[i] = d;
    }
  }
  const used = new Uint8Array(w * h);
  const cap = (i: number) => (deg[i] >= 3 ? deg[i] : 1); // 교차점은 가지 수만큼 통과 허용
  const out: Pt[][] = [];

  const walk = (sx: number, sy: number) => {
    const line: Pt[] = [{ x: sx, y: sy }];
    used[sy * w + sx]++;
    let cx = sx, cy = sy, pdx = 0, pdy = 0;
    for (let step = 0; step < 4000; step++) {
      let bx = -1, by = -1, bestScore = -Infinity;
      for (const [dx, dy] of NB) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const i = ny * w + nx;
        if (!skel[i] || used[i] >= cap(i)) continue;
        const score = (pdx || pdy) ? dx * pdx + dy * pdy : 0; // 진행 방향 유지 우선
        if (score > bestScore) { bestScore = score; bx = nx; by = ny; }
      }
      if (bx < 0) break;
      used[by * w + bx]++;
      pdx = Math.sign(bx - cx); pdy = Math.sign(by - cy);
      cx = bx; cy = by;
      line.push({ x: cx, y: cy });
    }
    return line;
  };

  // 1) 끝점(deg=1)에서 시작 — 획의 자연스러운 시작점
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (skel[i] && deg[i] === 1 && !used[i]) {
        const l = walk(x, y);
        if (l.length >= 3) out.push(l);
      }
    }
  }
  // 2) 남은 폐곡선(원 등)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (skel[i] && !used[i]) {
        const l = walk(x, y);
        if (l.length >= 3) out.push(l);
      }
    }
  }
  return out;
}

/** 이동평균 스무딩 (끝점 보존) */
function smoothLine(pts: Pt[]): Pt[] {
  if (pts.length < 5) return pts;
  const sm: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    sm.push({
      x: (pts[i - 1].x + pts[i].x + pts[i + 1].x) / 3,
      y: (pts[i - 1].y + pts[i].y + pts[i + 1].y) / 3,
    });
  }
  sm.push(pts[pts.length - 1]);
  return sm;
}

function lineLen(pts: Pt[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

/** 펜 이동 최소화 획 정렬: anchor(객체 좌상단)에서 가장 가까운 끝점부터, 가까운 끝점을 잇고 필요시 획 반전 */
function orderStrokes(strokes: Pt[][], anchor: Pt): Pt[][] {
  if (strokes.length === 0) return strokes;
  const remaining = strokes.slice();
  const ordered: Pt[][] = [];
  // 시작: 양 끝점 중 anchor(객체 bbox 좌상단)에 가장 가까운 획. 끝점이 더 가까우면 반전.
  let bi = 0, bv = Infinity, brev = false;
  for (let i = 0; i < remaining.length; i++) {
    const s = remaining[i];
    const h = s[0], tl = s[s.length - 1];
    const d0 = (h.x - anchor.x) ** 2 + (h.y - anchor.y) ** 2;
    const d1 = (tl.x - anchor.x) ** 2 + (tl.y - anchor.y) ** 2;
    if (d0 < bv) { bv = d0; bi = i; brev = false; }
    if (d1 < bv) { bv = d1; bi = i; brev = true; }
  }
  let cur = remaining.splice(bi, 1)[0];
  if (brev) cur = cur.slice().reverse();
  ordered.push(cur);
  while (remaining.length) {
    const pen = cur[cur.length - 1];
    let best = 0, bestD = Infinity, rev = false;
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i];
      const d0 = (s[0].x - pen.x) ** 2 + (s[0].y - pen.y) ** 2;
      const d1 = (s[s.length - 1].x - pen.x) ** 2 + (s[s.length - 1].y - pen.y) ** 2;
      if (d0 < bestD) { bestD = d0; best = i; rev = false; }
      if (d1 < bestD) { bestD = d1; best = i; rev = true; }
    }
    cur = remaining.splice(best, 1)[0];
    if (rev) cur = cur.slice().reverse();
    ordered.push(cur);
  }
  return ordered;
}

/**
 * 장면 기하 계산: 잉크 이진화 → 세선화 → 획 추출 → 획→객체 배정 → 영역 분할.
 * objects는 그리는 순서(reveal order)로 정렬되어 전달된다.
 */
function computeSceneGeo(
  image: ImageSource,
  objects: RevealObject[],
  fit: ReturnType<typeof computeFit>,
  sceneKey: string
): SceneItem[] {
  const key = `${sceneKey}|${objects.map((o) => o.id + o.bbox.join(",")).join(";")}|${Math.round(fit.drawW)}x${Math.round(fit.drawH)}`;
  const cached = sceneGeoCache.get(key);
  if (cached) {
    return objects.map((obj, i) => ({
      obj,
      strokes: cached.strokes[i] ?? [],
      lens: cached.lens[i] ?? [],
      total: cached.totals[i] ?? 0,
      region: cached.regions[i] ?? null,
    }));
  }

  // 표시 좌표계 객체 박스 (배정용)
  const boxes = objects.map((o) => {
    const x1 = o.bbox[0] * fit.bScaleX + fit.offsetX;
    const y1 = o.bbox[1] * fit.bScaleY + fit.offsetY;
    const x2 = o.bbox[2] * fit.bScaleX + fit.offsetX;
    const y2 = o.bbox[3] * fit.bScaleY + fit.offsetY;
    return { x1, y1, x2, y2, area: Math.max(1, (x2 - x1) * (y2 - y1)), cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
  });
  const ownerOf = (px: number, py: number): number => {
    let owner = -1, ownerArea = Infinity;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (px >= b.x1 && px <= b.x2 && py >= b.y1 && py <= b.y2 && b.area < ownerArea) {
        owner = i; ownerArea = b.area;
      }
    }
    if (owner < 0) {
      // 어떤 bbox에도 안 들어가면: "박스 테두리까지의 거리"가 가장 가까운 객체.
      // (중심점 거리를 쓰면 큰 박스가 멀리 있는 획까지 빨아들여 엉뚱한 객체에 배정됨)
      let bestD = Infinity;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        const dx = px < b.x1 ? b.x1 - px : px > b.x2 ? px - b.x2 : 0;
        const dy = py < b.y1 ? b.y1 - py : py > b.y2 ? py - b.y2 : 0;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; owner = i; }
      }
    }
    return owner;
  };

  let items: SceneItem[];

  try {
    // 1) 다운샘플 (긴 변 ~520px — 골격이 글자 디테일을 살릴 만큼)
    const DS = 520;
    const s = Math.min(DS / image.width, DS / image.height, 1);
    const dw = Math.max(16, Math.round(image.width * s));
    const dh = Math.max(16, Math.round(image.height * s));
    const tmp = scratch(_tmp, dw, dh);
    const tctx = tmp.getContext("2d", { willReadFrequently: true })!;
    tctx.clearRect(0, 0, dw, dh);
    tctx.drawImage(image, 0, 0, dw, dh);
    const { data } = tctx.getImageData(0, 0, dw, dh);

    const gray = new Float32Array(dw * dh);
    for (let i = 0; i < dw * dh; i++) {
      gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }

    // 2) 잉크 이진화: 어두운 픽셀 = 판서 선. 선이 너무 적으면(연한 그림) 소벨 엣지로 보강.
    const ink = new Uint8Array(dw * dh);
    let inkCnt = 0;
    for (let i = 0; i < dw * dh; i++) {
      if (gray[i] < 150) { ink[i] = 1; inkCnt++; }
    }
    if (inkCnt < dw * dh * 0.004) {
      for (let y = 1; y < dh - 1; y++) {
        for (let x = 1; x < dw - 1; x++) {
          const gx =
            -gray[(y - 1) * dw + x - 1] - 2 * gray[y * dw + x - 1] - gray[(y + 1) * dw + x - 1] +
             gray[(y - 1) * dw + x + 1] + 2 * gray[y * dw + x + 1] + gray[(y + 1) * dw + x + 1];
          const gy =
            -gray[(y - 1) * dw + x - 1] - 2 * gray[(y - 1) * dw + x] - gray[(y - 1) * dw + x + 1] +
             gray[(y + 1) * dw + x - 1] + 2 * gray[(y + 1) * dw + x] + gray[(y + 1) * dw + x + 1];
          if (Math.sqrt(gx * gx + gy * gy) > 80) ink[y * dw + x] = 1;
        }
      }
    }

    // 3) 세선화 → 획 추출 (다운샘플 좌표)
    const skel = thinSkeleton(ink, dw, dh);
    const rawStrokes = traceStrokes(skel, dw, dh);

    // 4) 표시 좌표 변환 + 스무딩 + 총 점 수 상한 (성능)
    const sx = fit.drawW / dw, sy = fit.drawH / dh;
    let polys = rawStrokes.map((line) =>
      smoothLine(line.map((p) => ({ x: fit.offsetX + p.x * sx, y: fit.offsetY + p.y * sy })))
    );
    const totalPts = polys.reduce((n, l) => n + l.length, 0);
    const MAXPTS = 2600;
    if (totalPts > MAXPTS) {
      const stride = Math.ceil(totalPts / MAXPTS);
      polys = polys.map((line) => {
        if (line.length <= 2) return line;
        const out: Pt[] = [];
        for (let i = 0; i < line.length; i += stride) out.push(line[i]);
        if (out[out.length - 1] !== line[line.length - 1]) out.push(line[line.length - 1]);
        return out;
      });
    }

    // 5) 획 → 객체 배정: 시작/중간/끝 3점 투표 (한 점 우연으로 엉뚱한 객체에 가지 않게)
    const buckets: Pt[][][] = objects.map(() => []);
    for (const line of polys) {
      const samples = [line[0], line[Math.floor(line.length / 2)], line[line.length - 1]];
      const votes = new Map<number, number>();
      for (const p of samples) {
        const o = ownerOf(p.x, p.y);
        if (o >= 0) votes.set(o, (votes.get(o) ?? 0) + 1);
      }
      let owner = -1, best = 0;
      for (const [o, v] of votes) if (v > best) { best = v; owner = o; }
      if (owner >= 0) buckets[owner].push(line);
    }
    // 객체 bbox 좌상단을 anchor로 — 첫 붓이 그 객체의 좌상단에서 시작 (중앙 진입 방지)
    const strokes = buckets.map((b, i) => orderStrokes(b, { x: boxes[i].x1, y: boxes[i].y1 }));
    const lens = strokes.map((b) => b.map(lineLen));
    const totals = lens.map((b) => Math.max(b.reduce((a, x) => a + x, 0), 1));

    // 6) 픽셀 영역 분할 (채움 패스용 — 영역 합집합 = 이미지 전체)
    const RG = 3;
    const rw = Math.ceil(dw / RG), rh = Math.ceil(dh / RG);
    const regionData = objects.map(() => new Uint8ClampedArray(rw * rh * 4));
    for (let ry = 0; ry < rh; ry++) {
      for (let rx = 0; rx < rw; rx++) {
        const px = fit.offsetX + ((rx + 0.5) * RG / dw) * fit.drawW;
        const py = fit.offsetY + ((ry + 0.5) * RG / dh) * fit.drawH;
        const owner = ownerOf(px, py);
        if (owner >= 0) {
          const o = (ry * rw + rx) * 4;
          regionData[owner][o] = 255; regionData[owner][o + 1] = 255;
          regionData[owner][o + 2] = 255; regionData[owner][o + 3] = 255;
        }
      }
    }
    const regions = objects.map((_, i) => {
      const cv = _createCanvas(rw, rh);
      cv.getContext("2d")!.putImageData(new _ImageData(regionData[i], rw, rh), 0, 0);
      return cv;
    });

    sceneGeoCache.set(key, { strokes, lens, totals, regions });
    items = objects.map((obj, i) => ({ obj, strokes: strokes[i], lens: lens[i], total: totals[i], region: regions[i] }));
  } catch {
    // CORS tainted 등 → 지그재그 한 획을 첫 객체에 폴백
    const points: Pt[] = [];
    const rows = 10;
    for (let r = 0; r < rows; r++) {
      const y = fit.offsetY + (fit.drawH * r) / (rows - 1);
      if (r % 2 === 0) { points.push({ x: fit.offsetX, y }); points.push({ x: fit.offsetX + fit.drawW, y }); }
      else { points.push({ x: fit.offsetX + fit.drawW, y }); points.push({ x: fit.offsetX, y }); }
    }
    const strokes = objects.map((_, i) => (i === 0 ? [points] : []));
    const lens = strokes.map((b) => b.map(lineLen));
    const totals = lens.map((b) => Math.max(b.reduce((a, x) => a + x, 0), 1));
    const regions = objects.map(() => null);
    sceneGeoCache.set(key, { strokes, lens, totals, regions });
    items = objects.map((obj, i) => ({ obj, strokes: strokes[i], lens: lens[i], total: totals[i], region: null }));
  }

  return items;
}

// ── 펜/손 ───────────────────────────────────────────────────────
// tool: "brush" | "marker" | "pen" | "hand-brush" | "hand-pen" | "hand-marker"
function drawHand(ctx: CanvasRenderingContext2D, pos: Pt, angle: number, tool: string, scale: number) {
  const isHand = tool.startsWith("hand-");
  const base = isHand ? tool.slice(5) : tool;

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(angle + Math.PI / 2); // 진행 방향으로 펜을 눕힘

  // 도구 몸체
  const len = 90 * scale;
  const grad = ctx.createLinearGradient(0, 0, 0, len);
  if (base === "brush") { grad.addColorStop(0, "#2A2A2E"); grad.addColorStop(1, "#8a5a2b"); }
  else if (base === "marker") { grad.addColorStop(0, "#1e1e22"); grad.addColorStop(1, "#444"); }
  else if (base === "pen") { grad.addColorStop(0, "#16233f"); grad.addColorStop(1, "#3b5bdb"); }
  else { grad.addColorStop(0, "#e8e0d0"); grad.addColorStop(1, "#cbbf9a"); }
  const bw = 6 * scale;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-bw, 8 * scale); ctx.lineTo(bw, 8 * scale);
  ctx.lineTo(bw * 0.66, len); ctx.lineTo(-bw * 0.66, len);
  ctx.closePath(); ctx.fill();
  // 촉
  ctx.fillStyle = "#2A2A2E";
  ctx.beginPath();
  ctx.moveTo(-3 * scale, 0); ctx.lineTo(3 * scale, 0); ctx.lineTo(0, 10 * scale);
  ctx.closePath(); ctx.fill();

  // 손 (펜대를 감싸 쥔 주먹 — 스타일라이즈드)
  if (isHand) {
    const s = scale;
    const skin = "#E9BC93";
    const lineC = "rgba(120, 80, 50, 0.5)";
    ctx.fillStyle = skin;
    ctx.strokeStyle = lineC;
    ctx.lineWidth = 1.5 * s;
    // 손바닥/주먹 덩어리
    ctx.beginPath();
    ctx.ellipse(3 * s, 48 * s, 18 * s, 24 * s, -0.3, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 손가락 4개 — 펜대를 가로질러 감김
    for (let f = 0; f < 4; f++) {
      const fy = (30 + f * 9) * s;
      ctx.beginPath();
      ctx.ellipse(-7 * s, fy, 11.5 * s, 4.6 * s, -0.12, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    // 엄지 — 반대편에서 펜대를 누름
    ctx.beginPath();
    ctx.ellipse(10 * s, 31 * s, 6 * s, 13 * s, 0.55, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // 소매 힌트
    ctx.fillStyle = "#7a8aa0";
    ctx.beginPath();
    ctx.ellipse(6 * s, 76 * s, 17 * s, 12 * s, -0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** 마스크에 경로 0..count 까지 붓 타입별로 흰색 스트로크.
 *  fadeTip: 그리는 중인 획만 끝부분을 옅게 (완료된 획은 false로 또렷하게) */
function strokePathOnMask(
  mctx: CanvasRenderingContext2D, path: Pt[], count: number, baseW: number, seed: number,
  brushType: BrushType = "round", fadeTip = true
) {
  if (count < 1 || path.length < 2) {
    if (path.length) { mctx.fillStyle = "#fff"; mctx.beginPath(); mctx.arc(path[0].x, path[0].y, baseW / 2, 0, Math.PI * 2); mctx.fill(); }
    return;
  }
  const rnd = createSeededRandom(seed);
  const n = Math.min(count, path.length - 1);
  const fade = fadeTip ? 12 : 0;
  mctx.strokeStyle = "#fff";
  mctx.fillStyle = "#fff";

  if (brushType === "round") {
    // ─ 기본 둥근 붓: 가변 두께 + 잉크 튐 ─
    mctx.lineCap = "round"; mctx.lineJoin = "round";
    mctx.shadowColor = "#fff"; mctx.shadowBlur = baseW * 0.35;
    for (let i = 1; i <= n; i++) {
      const p0 = path[i - 1], p1 = path[i];
      mctx.lineWidth = baseW * (0.5 + 0.3 * (0.5 + 0.5 * Math.sin(i * 0.35)));
      mctx.globalAlpha = i > n - fade ? Math.max(0.08, (n - i) / fade) : 1;
      mctx.beginPath(); mctx.moveTo(p0.x, p0.y); mctx.lineTo(p1.x, p1.y); mctx.stroke();
      if (rnd() < 0.35) {
        const r = baseW * (0.12 + rnd() * 0.3);
        mctx.globalAlpha = 0.5 + rnd() * 0.5;
        mctx.beginPath(); mctx.arc(p1.x + (rnd() - 0.5) * baseW, p1.y + (rnd() - 0.5) * baseW, r, 0, Math.PI * 2); mctx.fill();
      }
    }

  } else if (brushType === "dry") {
    // ─ 드라이브러시: 촘촘한 점 찍기, 군데군데 빈칸, 거친 질감 ─
    mctx.shadowColor = "#fff"; mctx.shadowBlur = baseW * 0.15;
    for (let i = 1; i <= n; i++) {
      const p0 = path[i - 1], p1 = path[i];
      const alpha = i > n - fade ? Math.max(0.06, (n - i) / fade) : 1;
      // 빈칸: 약 30% 구간은 건너뜀
      if (rnd() < 0.3) continue;
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len, ny = dx / len; // 법선 방향
      // 진행 방향을 따라 여러 개의 짧은 털 dab
      const dabs = 3 + Math.floor(rnd() * 3);
      for (let d = 0; d < dabs; d++) {
        const t2 = rnd(); // 세그먼트 상의 위치
        const spread = (rnd() - 0.5) * baseW * 0.9;
        const cx = p0.x + dx * t2 + nx * spread;
        const cy = p0.y + dy * t2 + ny * spread;
        const r = baseW * (0.08 + rnd() * 0.2);
        mctx.globalAlpha = alpha * (0.4 + rnd() * 0.6);
        mctx.beginPath(); mctx.arc(cx, cy, r, 0, Math.PI * 2); mctx.fill();
      }
    }

  } else if (brushType === "flat") {
    // ─ 평붓: 진행 방향 수직 사각형 터치. 넓고 납작. ─
    mctx.shadowColor = "#fff"; mctx.shadowBlur = baseW * 0.2;
    for (let i = 1; i <= n; i++) {
      const p0 = path[i - 1], p1 = path[i];
      const alpha = i > n - fade ? Math.max(0.08, (n - i) / fade) : 1;
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ang = Math.atan2(dy, dx);
      const w = baseW * (1.4 + 0.4 * Math.sin(i * 0.4)); // 넓은 폭
      const h = baseW * (0.18 + rnd() * 0.12);            // 얇은 두께
      mctx.save();
      mctx.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
      mctx.rotate(ang);
      mctx.globalAlpha = alpha;
      mctx.fillRect(-len / 2 - 1, -w / 2, len + 2, w);
      // 테두리 살짝 불규칙하게
      if (rnd() < 0.4) {
        mctx.globalAlpha = alpha * 0.4;
        mctx.fillRect(-len / 2 - 1, -w / 2 - h, len + 2, h);
        mctx.fillRect(-len / 2 - 1, w / 2, len + 2, h);
      }
      mctx.restore();
    }

  } else if (brushType === "bristle") {
    // ─ 강모붓: 5가닥 평행선, 각 가닥은 약간 어긋나고 불규칙 ─
    const STRANDS = 5;
    mctx.lineCap = "round"; mctx.lineJoin = "round";
    mctx.shadowColor = "#fff"; mctx.shadowBlur = baseW * 0.1;
    for (let s = 0; s < STRANDS; s++) {
      const rndS = createSeededRandom(seed + s * 1337);
      const offset = (s / (STRANDS - 1) - 0.5) * baseW * 1.2; // 좌우 퍼짐
      const thick = baseW * (0.08 + rndS() * 0.12);
      mctx.lineWidth = thick;
      mctx.beginPath();
      let started = false;
      for (let i = 1; i <= n; i++) {
        const p0 = path[i - 1], p1 = path[i];
        const alpha = i > n - fade ? Math.max(0.06, (n - i) / fade) : (0.5 + rndS() * 0.5);
        const dx = p1.x - p0.x, dy = p1.y - p0.y;
        const len2 = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len2, ny = dx / len2;
        // 가닥별 미세 흔들림
        const jx = (rndS() - 0.5) * baseW * 0.08;
        const jy = (rndS() - 0.5) * baseW * 0.08;
        const px = p1.x + nx * offset + jx;
        const py = p1.y + ny * offset + jy;
        // 드라이 효과: 간헐적 끊김
        if (rndS() < 0.12) { started = false; mctx.stroke(); mctx.beginPath(); continue; }
        mctx.globalAlpha = alpha;
        if (!started) { mctx.moveTo(px, py); started = true; }
        else mctx.lineTo(px, py);
      }
      mctx.stroke();
    }

  } else if (brushType === "ink") {
    // ─ 먹/캘리그래피: 속도에 따라 두께가 극적으로 변함. 얇다→두껍다→얇다 ─
    mctx.lineCap = "round"; mctx.lineJoin = "round";
    mctx.shadowColor = "#fff"; mctx.shadowBlur = baseW * 0.5;
    for (let i = 1; i <= n; i++) {
      const p0 = path[i - 1], p1 = path[i];
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const speed = Math.sqrt(dx * dx + dy * dy);
      // 빠르게 움직일수록 얇게 (필압 역관계)
      const pressure = 1 - Math.min(speed / (baseW * 0.8), 1) * 0.75;
      const w = baseW * (0.15 + pressure * 1.6);
      mctx.lineWidth = w;
      mctx.globalAlpha = i > n - fade ? Math.max(0.06, (n - i) / fade) : (0.85 + rnd() * 0.15);
      mctx.beginPath(); mctx.moveTo(p0.x, p0.y); mctx.lineTo(p1.x, p1.y); mctx.stroke();
      // 선 끝 잉크 뭉침
      if (rnd() < 0.18) {
        const r = w * (0.4 + rnd() * 0.6);
        mctx.beginPath(); mctx.arc(p1.x, p1.y, r, 0, Math.PI * 2); mctx.fill();
      }
    }

  } else if (brushType === "pencil") {
    // ─ 연필: 가는 심 + 미세 떨림 2겹 — 흑연의 가볍고 건조한 질감 ─
    mctx.lineCap = "round"; mctx.lineJoin = "round";
    mctx.shadowBlur = 0;
    for (let layer = 0; layer < 2; layer++) {
      const rndL = createSeededRandom(seed + layer * 7919);
      mctx.lineWidth = baseW * (0.16 + rndL() * 0.08);
      for (let i = 1; i <= n; i++) {
        const p0 = path[i - 1], p1 = path[i];
        const alpha = i > n - fade ? Math.max(0.05, (n - i) / fade) : (0.45 + rndL() * 0.4);
        const j = baseW * 0.12; // 손떨림
        mctx.globalAlpha = alpha;
        mctx.beginPath();
        mctx.moveTo(p0.x + (rndL() - 0.5) * j, p0.y + (rndL() - 0.5) * j);
        mctx.lineTo(p1.x + (rndL() - 0.5) * j, p1.y + (rndL() - 0.5) * j);
        mctx.stroke();
      }
    }

  } else if (brushType === "charcoal") {
    // ─ 목탄: 본선 + 주변에 흩어지는 굵은 입자(그레인) — 거칠고 분진 날리는 느낌 ─
    mctx.lineCap = "round"; mctx.lineJoin = "round";
    mctx.shadowBlur = 0;
    for (let i = 1; i <= n; i++) {
      const p0 = path[i - 1], p1 = path[i];
      const alpha = i > n - fade ? Math.max(0.06, (n - i) / fade) : 1;
      // 본선: 중간 굵기, 약간 투명
      mctx.lineWidth = baseW * (0.45 + 0.2 * Math.sin(i * 0.5));
      mctx.globalAlpha = alpha * 0.55;
      mctx.beginPath(); mctx.moveTo(p0.x, p0.y); mctx.lineTo(p1.x, p1.y); mctx.stroke();
      // 그레인: 선 주변 분진 입자
      const grains = 4 + Math.floor(rnd() * 4);
      for (let g = 0; g < grains; g++) {
        const t2 = rnd();
        const gx = p0.x + (p1.x - p0.x) * t2 + (rnd() - 0.5) * baseW * 1.1;
        const gy = p0.y + (p1.y - p0.y) * t2 + (rnd() - 0.5) * baseW * 1.1;
        mctx.globalAlpha = alpha * (0.15 + rnd() * 0.45);
        mctx.beginPath();
        mctx.arc(gx, gy, baseW * (0.05 + rnd() * 0.14), 0, Math.PI * 2);
        mctx.fill();
      }
    }

  } else if (brushType === "watercolor") {
    // ─ 수채: 넓고 투명한 겹침 + 큰 번짐 — 물이 스며들 듯 부드럽게 ─
    mctx.lineCap = "round"; mctx.lineJoin = "round";
    mctx.shadowColor = "#fff"; mctx.shadowBlur = baseW * 1.1;
    for (let i = 1; i <= n; i++) {
      const p0 = path[i - 1], p1 = path[i];
      const alpha = i > n - fade ? Math.max(0.04, ((n - i) / fade) * 0.5) : (0.3 + 0.15 * Math.sin(i * 0.25));
      mctx.lineWidth = baseW * (1.1 + 0.5 * Math.sin(i * 0.18));
      mctx.globalAlpha = alpha;
      mctx.beginPath(); mctx.moveTo(p0.x, p0.y); mctx.lineTo(p1.x, p1.y); mctx.stroke();
      // 물 고임(pooling): 가끔 큰 반투명 웅덩이
      if (rnd() < 0.07) {
        mctx.globalAlpha = alpha * 0.6;
        mctx.beginPath();
        mctx.arc(p1.x + (rnd() - 0.5) * baseW, p1.y + (rnd() - 0.5) * baseW, baseW * (0.7 + rnd() * 0.8), 0, Math.PI * 2);
        mctx.fill();
      }
    }

  } else if (brushType === "crayon") {
    // ─ 크레용: 왁스 질감 — 두 겹 어긋난 선 + 군데군데 안 발리는 부분 ─
    mctx.lineCap = "butt"; mctx.lineJoin = "round";
    mctx.shadowBlur = 0;
    for (let layer = 0; layer < 2; layer++) {
      const rndL = createSeededRandom(seed + layer * 4241);
      const off = (layer - 0.5) * baseW * 0.3;
      mctx.lineWidth = baseW * (0.4 + rndL() * 0.15);
      for (let i = 1; i <= n; i++) {
        // 왁스가 안 발리는 빈 구간 (종이 요철)
        if (rndL() < 0.18) continue;
        const p0 = path[i - 1], p1 = path[i];
        const alpha = i > n - fade ? Math.max(0.06, (n - i) / fade) : (0.55 + rndL() * 0.45);
        const dx = p1.x - p0.x, dy = p1.y - p0.y;
        const len2 = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / len2, ny = dx / len2;
        mctx.globalAlpha = alpha;
        mctx.beginPath();
        mctx.moveTo(p0.x + nx * off, p0.y + ny * off);
        mctx.lineTo(p1.x + nx * off, p1.y + ny * off);
        mctx.stroke();
      }
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
    const brushSpeed = Math.max(0.05, scene.hand?.speed ?? opts.brushSpeed ?? 1);
    const brushType: BrushType = scene.hand?.brushType ?? opts.brushType ?? "round";
    const baseW = Math.max(10, 42 * brushSize) * (height / 1920);

    const drawWindow = Math.max(scene.durationSec * 0.85, 0.5);

    if (objects.length === 0) {
      // 객체 없음 → 좌→우 점진 (폴백)
      const w = fit.drawW * ease(clamp01((t / drawWindow) * brushSpeed));
      ctx.save(); ctx.beginPath(); ctx.rect(fit.offsetX, fit.offsetY, w, fit.drawH); ctx.clip();
      ctx.drawImage(image, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH); ctx.restore();
    } else {
      // 객체를 그리는 순서대로 정렬 + 각 객체 경로/작업량
      const sorted = [...objects].sort(
        (a, b) => (a.startAt ?? a.revealOrder ?? 0) - (b.startAt ?? b.revealOrder ?? 0)
      );
      const items = computeSceneGeo(image, sorted, fit, scene.sceneId ?? "s")
        .filter((it) => it.strokes.length > 0);

      if (items.length === 0) {
        ctx.drawImage(image, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH);
      } else {
        // 타이밍은 객체의 startAt/endAt(초)을 그대로 따른다 = 나레이션 동기화.
        // (planner가 나레이션 anchorText로 startAt 산출. 없으면 아래 폴백으로 균등.)
        const N = items.length;
        const win = scene.durationSec * 0.85;
        const sched = items.map((it, i) => {
          let s = it.obj.startAt;
          let e = it.obj.endAt;
          if (s == null || e == null) {
            // 폴백(위→아래/나레이션 없음): 순서대로 균등 배분.
            // 겹침 최소(1.15) — 쓰던 곳을 거의 끝내고 다음으로 이동
            const slot = win / N;
            s = i * slot;
            e = s + slot * 1.15;
          }
          return { ...it, s, e };
        });
        const maxEnd = Math.max(win, ...sched.map((x) => x.e));
        // 나레이션 동기 모드(객체에 startAt 존재) = 절대시각. 슬라이더 가속은 폴백 모드에서만.
        const synced = sched.some((x) => x.obj.startAt != null);
        const tEff = synced ? t : t * brushSpeed;

        if (tEff >= maxEnd && !opts.noFinalImage) {
          ctx.drawImage(image, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH); // 완성본
        } else {
          const mask = scratch(_mask, width, height);
          const mctx = mask.getContext("2d")!;
          mctx.clearRect(0, 0, width, height);

          const pens: { pos: Pt; angle: number }[] = [];
          for (const it of sched) {
            const prog = clamp01((tEff - it.s) / Math.max(it.e - it.s, 0.01));
            if (prog <= 0) continue;
            const eased = ease(prog);

            // 붓 개수: 획 목록을 누적 길이 기준 brushCount 그룹으로 나눠 동시 진행.
            // 각 그룹 안에서는 획을 순서대로 — 한 획씩 선을 따라 슥슥 그려진다.
            const per = it.total / brushCount;
            let acc = 0;
            const groups: { strokes: Pt[][]; lens: number[]; total: number }[] =
              Array.from({ length: brushCount }, () => ({ strokes: [], lens: [], total: 0 }));
            for (let si = 0; si < it.strokes.length; si++) {
              const g = Math.min(brushCount - 1, Math.floor(acc / Math.max(per, 1e-6)));
              groups[g].strokes.push(it.strokes[si]);
              groups[g].lens.push(it.lens[si]);
              groups[g].total += it.lens[si];
              acc += it.lens[si];
            }

            for (let c = 0; c < brushCount; c++) {
              const grp = groups[c];
              if (grp.strokes.length === 0) continue;
              const targetL = grp.total * eased;
              let drawn = 0;
              for (let si = 0; si < grp.strokes.length; si++) {
                const line = grp.strokes[si];
                const len = grp.lens[si];
                const seed = hashSeed(it.obj.id + ":" + c + ":" + si);
                if (drawn + len <= targetL) {
                  // 이 획은 완료 — 전체를 또렷하게
                  strokePathOnMask(mctx, line, line.length - 1, baseW, seed, brushType, false);
                  drawn += len;
                } else {
                  // 현재 그리는 중인 획 — 부분 긋기 + 펜 위치
                  const frac = clamp01((targetL - drawn) / Math.max(len, 1e-6));
                  const cnt = Math.max(1, Math.floor((line.length - 1) * frac));
                  strokePathOnMask(mctx, line, cnt, baseW, seed, brushType);
                  if (prog < 1 && line.length >= 2) {
                    const idx = Math.min(cnt, line.length - 1);
                    const pos = line[idx];
                    const prev = line[Math.max(0, idx - 1)];
                    pens.push({ pos, angle: Math.atan2(pos.y - prev.y, pos.x - prev.x) });
                  }
                  break;
                }
              }
            }

            // 채움 패스: 이 객체에 "배정된 영역"이 붓 뒤를 따라 페이드인.
            // prog=1(=endAt)에 완전 불투명 → 자기 시간창 안에 100% 완성 보장.
            // 영역 합집합 = 화면 전체이므로 마지막 객체가 끝나면 그림이 자연히 완성됨.
            if (prog > 0.3) {
              const a = ease(clamp01((prog - 0.3) / 0.65)); // 0.3→0.95 동안 차오름, 0.95에 완성
              mctx.save();
              mctx.globalAlpha = a;
              if (it.region) {
                // 저해상 영역 마스크 업스케일 + blur → 경계가 먹 번지듯 부드럽게
                mctx.filter = `blur(${Math.max(baseW * 0.6, 8)}px)`;
                mctx.drawImage(it.region, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH);
                mctx.filter = "none";
              } else {
                // 영역 없음(CORS 폴백): bbox 방사 그라데이션
                const bx1 = it.obj.bbox[0] * fit.bScaleX + fit.offsetX;
                const by1 = it.obj.bbox[1] * fit.bScaleY + fit.offsetY;
                const bx2 = it.obj.bbox[2] * fit.bScaleX + fit.offsetX;
                const by2 = it.obj.bbox[3] * fit.bScaleY + fit.offsetY;
                const cx = (bx1 + bx2) / 2, cy = (by1 + by2) / 2;
                const rx = ((bx2 - bx1) / 2) * 1.35 + baseW * 2;
                const ry = ((by2 - by1) / 2) * 1.35 + baseW * 2;
                mctx.translate(cx, cy);
                mctx.scale(Math.max(rx, 1), Math.max(ry, 1));
                const g = mctx.createRadialGradient(0, 0, 0, 0, 0, 1);
                g.addColorStop(0, "rgba(255,255,255,1)");
                g.addColorStop(0.6, "rgba(255,255,255,0.75)");
                g.addColorStop(1, "rgba(255,255,255,0)");
                mctx.fillStyle = g;
                mctx.beginPath();
                mctx.arc(0, 0, 1, 0, Math.PI * 2);
                mctx.fill();
              }
              mctx.restore();
            }
          }

          // (전역 채움 패스 제거 — 객체별 영역 채움이 prog=1에 100% 완성을 보장하므로
          //  갑자기 전체가 나타나는 점프가 없다. 영역 합집합 = 화면 전체.)

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
        } // end t < effective
      } // end items > 0
    } // end objects > 0

    // 디버그: bbox 오버레이 (그리는 순서·시간 검증용)
    if (opts.debugBoxes) {
      const objs = (scene.reveal?.objects ?? []).filter((o) => o.bbox);
      const ordered = [...objs].sort((a, b) => (a.startAt ?? a.revealOrder ?? 0) - (b.startAt ?? b.revealOrder ?? 0));
      ctx.save();
      ctx.font = `bold ${Math.round(height / 60)}px sans-serif`;
      ctx.textBaseline = "top";
      for (let i = 0; i < ordered.length; i++) {
        const o = ordered[i];
        const x1 = o.bbox[0] * fit.bScaleX + fit.offsetX;
        const y1 = o.bbox[1] * fit.bScaleY + fit.offsetY;
        const x2 = o.bbox[2] * fit.bScaleX + fit.offsetX;
        const y2 = o.bbox[3] * fit.bScaleY + fit.offsetY;
        const hue = (i * 57) % 360;
        ctx.strokeStyle = `hsl(${hue} 85% 45%)`;
        ctx.lineWidth = Math.max(2, height / 500);
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        const label = `${i + 1} ${o.role} ${o.startAt != null ? o.startAt.toFixed(1) + "~" + (o.endAt ?? 0).toFixed(1) + "s" : ""}`;
        ctx.fillStyle = `hsl(${hue} 85% 40%)`;
        ctx.fillRect(x1, y1, ctx.measureText(label).width + 10, height / 50);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, x1 + 5, y1 + 2);
      }
      ctx.restore();
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
