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
  /** 테스트용: 초당 그리는 점 수. 주면 durationSec 무시하고 작업량 기준으로 그림 (시간 제한 없음) */
  pace?: number;
  /** 테스트용: 완성본으로 점프하지 않고 path 드로잉만 유지 */
  noFinalImage?: boolean;
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

// ── 장면 전체 경로 생성 ──────────────────────────────────────────
// 이미지 "전체"를 한 번에 분석(엣지)하고, 각 점을 의미 객체 정확히 하나에 배정한다.
// (bbox가 겹쳐도 점은 한 번만 그려짐 → 같은 곳 재방문/뭉침/순서 붕괴 제거)
interface Pt { x: number; y: number }
interface SceneItem { obj: RevealObject; path: Pt[] }
const scenePathCache = new Map<string, SceneItem[]>();

/** 점들을 TSP(최근접 이웃)로 잇고 이동평균 스무딩 */
function orderAndSmooth(pts: Pt[]): Pt[] {
  if (pts.length === 0) return [];
  const ordered: Pt[] = [];
  const used = new Array(pts.length).fill(false);
  let cur = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i].y < pts[cur].y) cur = i; // 위에서 시작
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
  const sm: Pt[] = [];
  const W = 2;
  for (let i = 0; i < ordered.length; i++) {
    let sx = 0, sy = 0, n = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(ordered.length - 1, i + W); j++) { sx += ordered[j].x; sy += ordered[j].y; n++; }
    sm.push({ x: sx / n, y: sy / n });
  }
  return sm;
}

/**
 * 장면 경로 계산: 전체 이미지 엣지 → 점→객체 배정 → 객체별 TSP 경로.
 * objects는 그리는 순서(reveal order)로 정렬되어 전달된다.
 */
function computeScenePaths(
  image: ImageSource,
  objects: RevealObject[],
  fit: ReturnType<typeof computeFit>,
  sceneKey: string
): SceneItem[] {
  const key = `${sceneKey}|${objects.map((o) => o.id + o.bbox.join(",")).join(";")}|${Math.round(fit.drawW)}x${Math.round(fit.drawH)}`;
  const hit = scenePathCache.get(key);
  if (hit) return hit;

  const rnd = createSeededRandom(hashSeed(key));

  // 표시 좌표계 객체 박스 (배정용)
  const boxes = objects.map((o) => {
    const x1 = o.bbox[0] * fit.bScaleX + fit.offsetX;
    const y1 = o.bbox[1] * fit.bScaleY + fit.offsetY;
    const x2 = o.bbox[2] * fit.bScaleX + fit.offsetX;
    const y2 = o.bbox[3] * fit.bScaleY + fit.offsetY;
    return { x1, y1, x2, y2, area: Math.max(1, (x2 - x1) * (y2 - y1)), cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
  });

  let items: SceneItem[];

  try {
    // 1) 전체 이미지 다운샘플 (긴 변 ~460px — 선 디테일 추적용 고해상)
    const DS = 460;
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

    // 2) 소벨 엣지 + 그리드 양자화(셀당 1점) + 빈 셀 노이즈
    const cell = 2; // 촘촘하게 — 선의 디테일을 따라가도록
    const cols = Math.ceil(dw / cell);
    const seen = new Set<number>();
    const raw: Pt[] = [];
    for (let y = 1; y < dh - 1; y++) {
      for (let x = 1; x < dw - 1; x++) {
        const gx =
          -gray[(y - 1) * dw + x - 1] - 2 * gray[y * dw + x - 1] - gray[(y + 1) * dw + x - 1] +
           gray[(y - 1) * dw + x + 1] + 2 * gray[y * dw + x + 1] + gray[(y + 1) * dw + x + 1];
        const gy =
          -gray[(y - 1) * dw + x - 1] - 2 * gray[(y - 1) * dw + x] - gray[(y - 1) * dw + x + 1] +
           gray[(y + 1) * dw + x - 1] + 2 * gray[(y + 1) * dw + x] + gray[(y + 1) * dw + x + 1];
        if (Math.sqrt(gx * gx + gy * gy) > 90) {
          const ck = Math.floor(y / cell) * cols + Math.floor(x / cell);
          if (!seen.has(ck)) { seen.add(ck); raw.push({ x, y }); }
        }
      }
    }
    for (let gy = 0; gy < dh; gy += cell) {
      for (let gx = 0; gx < dw; gx += cell) {
        const ck = Math.floor(gy / cell) * cols + Math.floor(gx / cell);
        if (!seen.has(ck) && rnd() < 0.025) { seen.add(ck); raw.push({ x: gx + cell / 2, y: gy + cell / 2 }); }
      }
    }

    // 3) 표시 좌표 변환 + 성능 상한
    let pts = raw.map((p) => ({
      x: fit.offsetX + (p.x / dw) * fit.drawW,
      y: fit.offsetY + (p.y / dh) * fit.drawH,
    }));
    const MAX = 1700;
    if (pts.length > MAX) {
      const step = pts.length / MAX;
      const reduced: Pt[] = [];
      for (let i = 0; i < pts.length; i += step) reduced.push(pts[Math.floor(i)]);
      pts = reduced;
    }

    // 4) 점 → 객체 배정: 포함하는 bbox 중 면적이 가장 작은(가장 구체적인) 객체.
    //    아무 bbox에도 안 들어가면 가장 가까운 중심의 객체로 (전체 커버, 점은 정확히 1회).
    const buckets: Pt[][] = objects.map(() => []);
    for (const p of pts) {
      let owner = -1, ownerArea = Infinity;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (p.x >= b.x1 && p.x <= b.x2 && p.y >= b.y1 && p.y <= b.y2 && b.area < ownerArea) {
          owner = i; ownerArea = b.area;
        }
      }
      if (owner < 0) {
        let bestD = Infinity;
        for (let i = 0; i < boxes.length; i++) {
          const d = (boxes[i].cx - p.x) ** 2 + (boxes[i].cy - p.y) ** 2;
          if (d < bestD) { bestD = d; owner = i; }
        }
      }
      if (owner >= 0) buckets[owner].push(p);
    }

    // 5) 객체별 TSP + 스무딩 (그리는 순서 그대로)
    items = objects.map((obj, i) => ({ obj, path: orderAndSmooth(buckets[i]) }));
  } catch {
    // CORS tainted 등 → 전체 지그재그를 첫 객체에 폴백
    const points: Pt[] = [];
    const rows = 10;
    for (let r = 0; r < rows; r++) {
      const y = fit.offsetY + (fit.drawH * r) / (rows - 1);
      if (r % 2 === 0) { points.push({ x: fit.offsetX, y }); points.push({ x: fit.offsetX + fit.drawW, y }); }
      else { points.push({ x: fit.offsetX + fit.drawW, y }); points.push({ x: fit.offsetX, y }); }
    }
    items = objects.map((obj, i) => ({ obj, path: i === 0 ? points : [] }));
  }

  scenePathCache.set(key, items);
  return items;
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
  mctx.shadowBlur = baseW * 0.35;
  const n = Math.min(count, path.length - 1);
  const fade = 12; // 펜 끝 최근 구간은 옅게 시작 → 점점 진해짐 (끊김 방지)
  for (let i = 1; i <= n; i++) {
    const p0 = path[i - 1], p1 = path[i];
    // 동적 두께 (사인 압력) — 얇게 유지해 선의 디테일을 따라가는 게 보이게.
    // 못 덮은 여백은 마무리 패스(70% 타원/92% 전역)가 채우므로 얇아도 빵꾸 없음.
    const w = baseW * (0.5 + 0.3 * (0.5 + 0.5 * Math.sin(i * 0.35)));
    mctx.lineWidth = w;
    mctx.globalAlpha = i > n - fade ? Math.max(0.08, (n - i) / fade) : 1;
    mctx.beginPath();
    mctx.moveTo(p0.x, p0.y);
    mctx.lineTo(p1.x, p1.y);
    mctx.stroke();
    // 잉크 튐 (dabs)
    if (rnd() < 0.35) {
      const r = baseW * (0.12 + rnd() * 0.3);
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
    const brushSpeed = Math.max(0.05, scene.hand?.speed ?? opts.brushSpeed ?? 1);
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
      const items = computeScenePaths(image, sorted, fit, scene.sceneId ?? "s")
        .filter((it) => it.path.length > 0);

      if (items.length === 0) {
        ctx.drawImage(image, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH);
      } else {
        // 이어달리기 스케줄: 객체 i가 30% 그려지면 객체 i+1 붓이 등장 (cascade).
        // 동시 활성 붓은 brushCount로 제한 — 초과 시 앞 붓이 끝날 때까지 대기.
        const OVERLAP = 0.3;
        const starts: number[] = [];
        const endsArr: number[] = [];
        for (let i = 0; i < items.length; i++) {
          const w = Math.max(1, items[i].path.length);
          let s = i === 0 ? 0 : starts[i - 1] + Math.max(1, items[i - 1].path.length) * OVERLAP;
          if (i >= brushCount) s = Math.max(s, endsArr[i - brushCount]); // 붓 수 제한
          starts.push(s);
          endsArr.push(s + w);
        }
        const sched = items.map((it, i) => ({ ...it, s: starts[i], e: endsArr[i] }));
        const makespan = Math.max(1, ...endsArr);
        // 그리기 완성 시각. 테스트(pace)면 작업량 기준(시간 제한 없음), 영상이면 오디오 길이 내로 클램프.
        const effective = opts.pace
          ? makespan / opts.pace / brushSpeed
          : Math.min(scene.durationSec * 0.96, drawWindow / brushSpeed);
        const scaleT = effective / makespan;

        if (t >= effective && !opts.noFinalImage) {
          ctx.drawImage(image, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH); // 완성본
        } else {
          const mask = scratch(_mask, width, height);
          const mctx = mask.getContext("2d")!;
          mctx.clearRect(0, 0, width, height);

          const pens: { pos: Pt; angle: number }[] = [];
          for (const it of sched) {
            const sT = it.s * scaleT;
            const eT = it.e * scaleT;
            const prog = clamp01((t - sT) / Math.max(eT - sT, 0.01));
            if (prog <= 0) continue;
            const cnt = Math.max(1, Math.floor(it.path.length * ease(prog)));
            strokePathOnMask(mctx, it.path, cnt, baseW, hashSeed(it.obj.id));

            // 채움 패스: 붓이 궤적을 45%쯤 그리면 그 공간이 뒤따라 서서히 페이드인.
            // 가장자리가 투명으로 사라지는 타원 방사 그라데이션(먹 번짐) — 직선 모서리 없음.
            if (prog > 0.45) {
              const a = ease(clamp01((prog - 0.45) / 0.5));
              const bx1 = it.obj.bbox[0] * fit.bScaleX + fit.offsetX;
              const by1 = it.obj.bbox[1] * fit.bScaleY + fit.offsetY;
              const bx2 = it.obj.bbox[2] * fit.bScaleX + fit.offsetX;
              const by2 = it.obj.bbox[3] * fit.bScaleY + fit.offsetY;
              const cx = (bx1 + bx2) / 2, cy = (by1 + by2) / 2;
              const rx = (bx2 - bx1) / 2 + baseW, ry = (by2 - by1) / 2 + baseW;
              mctx.save();
              mctx.globalAlpha = a;
              mctx.translate(cx, cy);
              mctx.scale(Math.max(rx, 1), Math.max(ry, 1));
              const g = mctx.createRadialGradient(0, 0, 0, 0, 0, 1);
              g.addColorStop(0, "rgba(255,255,255,1)");
              g.addColorStop(0.72, "rgba(255,255,255,1)");
              g.addColorStop(1, "rgba(255,255,255,0)");
              mctx.fillStyle = g;
              mctx.beginPath();
              mctx.arc(0, 0, 1, 0, Math.PI * 2);
              mctx.fill();
              mctx.restore();
            }
            // 현재 그리는 중인 객체에만 펜 (붓당 1개 → 동시 최대 brushCount, 끊김 없이 순환)
            if (prog < 1 && it.path.length >= 2) {
              const idx = Math.min(cnt, it.path.length - 1);
              const pos = it.path[idx];
              const prev = it.path[Math.max(0, idx - 1)];
              pens.push({ pos, angle: Math.atan2(pos.y - prev.y, pos.x - prev.x) });
            }
          }

          // 최종 패스: 전체 진행 92%부터 캔버스 전체를 서서히 공개.
          // 붓이 못 간 어떤 빈 곳도 끝에는 반드시 채워짐 (측정 불필요한 전역 보증).
          const gp = clamp01(t / Math.max(effective, 0.01));
          if (gp > 0.92) {
            mctx.globalAlpha = ease((gp - 0.92) / 0.08);
            mctx.fillStyle = "#fff";
            mctx.fillRect(0, 0, width, height);
            mctx.globalAlpha = 1;
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
        } // end t < effective
      } // end items > 0
    } // end objects > 0
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
