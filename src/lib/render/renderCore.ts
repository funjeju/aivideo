/**
 * 렌더 코어 — 프레임워크 독립.
 * Canvas 2D 컨텍스트만 받아 한 프레임을 그린다.
 * 브라우저 프리뷰와 Cloud Run Worker(headless Chromium / node-canvas)가 공유.
 *
 * 결정적: 같은 SceneSpec + 같은 t → 항상 같은 픽셀.
 */
import { SceneSpec, RevealObject } from "@/lib/types";
import { createSeededRandom, hashSeed } from "./seededRandom";

export interface CanvasSize {
  width: number;
  height: number;
}

export const ASPECT_SIZES: Record<string, CanvasSize> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
};

const PAPER_COLORS: Record<string, string> = {
  white: "#FFFFFF",
  "paper-hanji": "#FAF8F4",
};

// Scene Spec bbox 기준 이미지 좌표계 (GPT Image 2 출력 기준)
const SRC_IMG_W = 1024;
const SRC_IMG_H = 1536;

type ImageSource = CanvasImageSource & { width: number; height: number };

interface RenderOptions {
  /** 손 애니메이션 표시 여부 (프리뷰에서 끌 수 있음) */
  showHand?: boolean;
  /** 붓 크기 배수 (기본 1). scene.hand.size가 우선. */
  brushSize?: number;
}

/** easeInOutCubic */
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** 이미지를 contain 배치했을 때의 변환 파라미터 */
function computeFit(canvas: CanvasSize, img?: ImageSource) {
  const iw = img?.width ?? SRC_IMG_W;
  const ih = img?.height ?? SRC_IMG_H;
  const scale = Math.min(canvas.width / iw, canvas.height / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  return {
    scale,
    offsetX: (canvas.width - drawW) / 2,
    offsetY: (canvas.height - drawH) / 2,
    drawW,
    drawH,
    // bbox(원본 1024x1536) → 표시 좌표 변환 비율
    bScaleX: drawW / SRC_IMG_W,
    bScaleY: drawH / SRC_IMG_H,
  };
}

interface ObjBox { x1: number; y1: number; w: number; h: number }

function objBox(obj: RevealObject, fit: ReturnType<typeof computeFit>): ObjBox {
  const x1 = obj.bbox[0] * fit.bScaleX + fit.offsetX;
  const y1 = obj.bbox[1] * fit.bScaleY + fit.offsetY;
  const x2 = obj.bbox[2] * fit.bScaleX + fit.offsetX;
  const y2 = obj.bbox[3] * fit.bScaleY + fit.offsetY;
  return { x1, y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * 손글씨식 스트로크 리빌.
 * bbox를 수평 밴드로 나눠 위→아래로 한 줄씩 긋되, 각 줄은 좌우 교대(부메랑)로 칠한다.
 * 펜이 실제로 줄을 그어 내려가는 궤적을 만든다 (단순 한 방향 마스크 아님).
 * @returns 공개된 사각 영역들 + 현재 펜 끝점
 */
function strokeReveal(
  obj: RevealObject,
  progress: number,
  fit: ReturnType<typeof computeFit>,
  bandH: number
): { rects: [number, number, number, number][]; pen: { x: number; y: number } | null } {
  if (progress <= 0) return { rects: [], pen: null };
  const { x1, y1, w, h } = objBox(obj, fit);
  const p = clamp01(progress);

  const numBands = Math.max(1, Math.round(h / bandH));
  const realBandH = h / numBands;
  const totalProg = p * numBands;            // 0..numBands
  const fullBands = Math.floor(totalProg);   // 완전히 칠해진 줄 수
  const frac = totalProg - fullBands;        // 현재 줄 진행도 0..1

  // 줄마다 손그림식 미세 불규칙 (결정적). 시작 위치·길이·높이를 살짝 흔든다.
  const jit = (b: number, k: number) => (createSeededRandom(hashSeed(`${obj.id}:${b}:${k}`))() - 0.5);
  const overshoot = realBandH * 0.9; // 줄을 조금 두껍게 겹쳐 빈틈 제거 + 붓 번짐 느낌

  const rects: [number, number, number, number][] = [];
  // 완성된 줄
  for (let b = 0; b < fullBands && b < numBands; b++) {
    const dx = jit(b, 0) * realBandH * 0.5;
    const dw = jit(b, 1) * realBandH * 0.7;
    const dy = jit(b, 2) * realBandH * 0.25;
    rects.push([x1 + dx, y1 + b * realBandH + dy, w + Math.abs(dw) + 2, realBandH + overshoot]);
  }

  let pen: { x: number; y: number } | null = null;
  if (fullBands < numBands && frac > 0) {
    const b = fullBands;
    const dy = jit(b, 2) * realBandH * 0.25;
    const yTop = y1 + b * realBandH + dy;
    const ltr = b % 2 === 0; // 짝수 줄 좌→우, 홀수 줄 우→좌
    const cw = w * frac;
    if (ltr) {
      rects.push([x1, yTop, cw, realBandH + overshoot]);
      pen = { x: x1 + cw, y: yTop + realBandH / 2 };
    } else {
      rects.push([x1 + w - cw, yTop, cw, realBandH + overshoot]);
      pen = { x: x1 + w - cw, y: yTop + realBandH / 2 };
    }
  } else if (fullBands >= numBands) {
    pen = null; // 완성
  } else {
    pen = { x: x1, y: y1 };
  }

  return { rects, pen };
}

/** 현재 그려지고 있는(활성) 객체의 펜 끝점 */
function handPosition(
  objects: RevealObject[],
  t: number,
  fit: ReturnType<typeof computeFit>,
  bandH: number
): { x: number; y: number } | null {
  const active = objects
    .filter((o) => (o.startAt ?? 0) <= t && t < (o.endAt ?? 0))
    .sort((a, b) => (b.startAt ?? 0) - (a.startAt ?? 0))[0];
  if (!active) return null;
  const start = active.startAt ?? 0;
  const end = active.endAt ?? start + 1;
  const progress = clamp01((t - start) / Math.max(end - start, 0.01));
  return strokeReveal(active, progress, fit, bandH).pen;
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  tool: string,
  scale: number
) {
  ctx.save();
  // 끝점에 잉크 자국
  ctx.fillStyle = "rgba(42,42,46,0.5)";
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 3 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(pos.x, pos.y);
  ctx.rotate(-Math.PI / 4);

  // 도구 몸통
  const len = 90 * scale;
  const grad = ctx.createLinearGradient(0, 0, 0, len);
  if (tool === "brush") {
    grad.addColorStop(0, "#2A2A2E");
    grad.addColorStop(1, "#8a5a2b");
  } else if (tool === "marker") {
    grad.addColorStop(0, "#1e1e22");
    grad.addColorStop(1, "#444");
  } else {
    grad.addColorStop(0, "#e8e0d0");
    grad.addColorStop(1, "#cbbf9a");
  }
  const bw = 6 * scale;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-bw, 8 * scale);
  ctx.lineTo(bw, 8 * scale);
  ctx.lineTo(bw * 0.66, len);
  ctx.lineTo(-bw * 0.66, len);
  ctx.closePath();
  ctx.fill();

  // 펜촉
  ctx.fillStyle = "#2A2A2E";
  ctx.beginPath();
  ctx.moveTo(-3 * scale, 0);
  ctx.lineTo(3 * scale, 0);
  ctx.lineTo(0, 10 * scale);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * 한 장면의 시각 t(초) 프레임을 그린다.
 * @param ctx Canvas 2D 컨텍스트
 * @param scene SceneSpec
 * @param image 로드된 이미지 (없으면 종이 배경만)
 * @param t 장면 내 로컬 시간(초)
 * @param canvasSize 출력 캔버스 크기
 */
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

  // 배경 (종이)
  ctx.save();
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // 카메라 변환 (줌/패닝 키프레임 선형 보간)
  const cam = interpolateCamera(scene.camera, t);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-width / 2 - cam.x, -height / 2 - cam.y);

  const fit = computeFit(canvasSize, image);

  if (image) {
    const objects = scene.reveal?.objects ?? [];
    // 붓 크기 (어드민/스타일 설정). 1=기본. 밴드 높이·펜 크기에 반영.
    const brushSize = scene.hand?.size ?? opts.brushSize ?? 1;
    const bandH = Math.max(18, 46 * brushSize) * (canvasSize.height / 1920);

    // 모든 reveal이 끝나는 시각. 이후엔 완성본 전체를 보여준다 (끝까지 다 그린 뒤 유지).
    const maxEnd = objects.length
      ? Math.max(...objects.map((o) => o.endAt ?? 0))
      : Math.max(scene.durationSec * 0.85, 0.5);

    if (t >= maxEnd || objects.length === 0) {
      // reveal 완료(또는 객체 없음) → 전체 이미지. 객체가 없으면 좌→우 점진.
      if (objects.length === 0 && t < maxEnd) {
        const w = fit.drawW * ease(clamp01(t / maxEnd));
        ctx.save();
        ctx.beginPath();
        ctx.rect(fit.offsetX, fit.offsetY, w, fit.drawH);
        ctx.clip();
        ctx.drawImage(image, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH);
        ctx.restore();
      } else {
        ctx.drawImage(image, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH);
      }
    } else {
      // 스트로크 공개: 사각형이 아니라 둥근 붓 자국(캡슐)으로 칠해나감 → 사각 경계 제거
      ctx.save();
      ctx.beginPath();
      let any = false;
      for (const obj of objects) {
        const start = obj.startAt ?? 0;
        const end = obj.endAt ?? start + 1;
        const progress = clamp01((t - start) / Math.max(end - start, 0.01));
        const { rects } = strokeReveal(obj, progress, fit, bandH);
        for (const r of rects) {
          // 캡슐(양끝 둥근) = 붓이 지나간 자국. 반경은 줄 높이 절반.
          const radius = Math.min(r[2], r[3]) / 2;
          ctx.roundRect(r[0], r[1], r[2], r[3], radius);
          any = true;
        }
      }
      if (any) {
        ctx.clip();
        ctx.drawImage(image, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH);
      }
      ctx.restore();

      // 펜 애니메이션
      if (opts.showHand !== false && scene.hand?.enabled) {
        const pos = handPosition(objects, t, fit, bandH);
        if (pos) drawHand(ctx, pos, scene.hand.asset, Math.max(0.6, brushSize) * (canvasSize.height / 1920) * 1.2);
      }
    }
  }

  ctx.restore();

  // 오버레이 (한지 텍스처 opacity 등은 에셋 로드가 필요하므로 색 틴트로 근사)
  for (const ov of scene.overlays ?? []) {
    if (ov.type === "texture" && ov.opacity) {
      // 에셋 미로드 시 미세한 웜 틴트로 통일감만 부여 (결정적)
      ctx.save();
      ctx.globalAlpha = ov.opacity * 0.4;
      ctx.fillStyle = "#d9cdb0";
      ctx.globalCompositeOperation = "multiply";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }
}

function interpolateCamera(
  camera: SceneSpec["camera"],
  t: number
): { scale: number; x: number; y: number } {
  if (!camera || camera.length === 0) return { scale: 1, x: 0, y: 0 };
  if (camera.length === 1) {
    const k = camera[0];
    return { scale: k.scale, x: k.x, y: k.y };
  }
  // t를 포함하는 구간 찾기
  let prev = camera[0];
  let next = camera[camera.length - 1];
  for (let i = 0; i < camera.length - 1; i++) {
    if (t >= camera[i].at && t <= camera[i + 1].at) {
      prev = camera[i];
      next = camera[i + 1];
      break;
    }
  }
  const span = next.at - prev.at;
  const p = span <= 0 ? 0 : ease(clamp01((t - prev.at) / span));
  return {
    scale: prev.scale + (next.scale - prev.scale) * p,
    x: prev.x + (next.x - prev.x) * p,
    y: prev.y + (next.y - prev.y) * p,
  };
}

/**
 * 여러 장면의 타임라인. globalT(초) → 어느 장면의 localT인지.
 */
export interface TimelineEntry {
  scene: SceneSpec;
  startTime: number;
  endTime: number;
}

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

export function findSceneAt(
  timeline: TimelineEntry[],
  globalT: number
): { entry: TimelineEntry; localT: number } | null {
  for (const entry of timeline) {
    if (globalT >= entry.startTime && globalT < entry.endTime) {
      return { entry, localT: globalT - entry.startTime };
    }
  }
  // 끝을 넘으면 마지막 장면 끝 프레임
  if (timeline.length > 0 && globalT >= timeline[timeline.length - 1].endTime) {
    const last = timeline[timeline.length - 1];
    return { entry: last, localT: last.endTime - last.startTime };
  }
  return null;
}

// seed 유틸 재노출 (Worker에서 결정적 효과에 사용)
export { createSeededRandom, hashSeed };
