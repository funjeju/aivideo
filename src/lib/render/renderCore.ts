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

/** flowDirection + progress로 객체 bbox 안에서 공개된 사각 영역 계산 */
function revealedRect(
  obj: RevealObject,
  progress: number,
  fit: ReturnType<typeof computeFit>
): [number, number, number, number] | null {
  if (progress <= 0) return null;
  const p = ease(clamp01(progress));

  const x1 = obj.bbox[0] * fit.bScaleX + fit.offsetX;
  const y1 = obj.bbox[1] * fit.bScaleY + fit.offsetY;
  const x2 = obj.bbox[2] * fit.bScaleX + fit.offsetX;
  const y2 = obj.bbox[3] * fit.bScaleY + fit.offsetY;
  const w = x2 - x1;
  const h = y2 - y1;

  switch (obj.flowDirection) {
    case "right-to-left":
      return [x2 - w * p, y1, w * p, h];
    case "top-to-bottom":
      return [x1, y1, w, h * p];
    case "bottom-to-top":
      return [x1, y2 - h * p, w, h * p];
    case "center-out": {
      const cw = w * p;
      const ch = h * p;
      return [x1 + (w - cw) / 2, y1 + (h - ch) / 2, cw, ch];
    }
    case "left-to-right":
    default:
      return [x1, y1, w * p, h];
  }
}

/** 손(붓/펜/분필) 위치 = 현재 활성 객체의 공개 엣지 */
function handPosition(
  objects: RevealObject[],
  t: number,
  fit: ReturnType<typeof computeFit>
): { x: number; y: number } | null {
  // 가장 최근에 활성(startAt<=t<endAt)인 객체
  const active = objects
    .filter((o) => (o.startAt ?? 0) <= t && t < (o.endAt ?? 0))
    .sort((a, b) => (b.startAt ?? 0) - (a.startAt ?? 0))[0];
  if (!active) return null;

  const start = active.startAt ?? 0;
  const end = active.endAt ?? start + 1;
  const progress = clamp01((t - start) / Math.max(end - start, 0.01));
  const rect = revealedRect(active, progress, fit);
  if (!rect) return null;

  // 리빌 진행 엣지의 끝점
  const [rx, ry, rw, rh] = rect;
  switch (active.flowDirection) {
    case "right-to-left":
      return { x: rx, y: ry + rh / 2 };
    case "top-to-bottom":
      return { x: rx + rw / 2, y: ry + rh };
    case "bottom-to-top":
      return { x: rx + rw / 2, y: ry };
    case "center-out":
      return { x: rx + rw, y: ry + rh };
    case "left-to-right":
    default:
      return { x: rx + rw, y: ry + rh / 2 };
  }
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  tool: string
) {
  ctx.save();
  // 손/도구 단순 표현: 끝점에 작은 원 + 손잡이 선
  ctx.translate(pos.x, pos.y);
  ctx.rotate(-Math.PI / 4);

  // 도구 몸통
  const len = 90;
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
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-6, 8);
  ctx.lineTo(6, 8);
  ctx.lineTo(4, len);
  ctx.lineTo(-4, len);
  ctx.closePath();
  ctx.fill();

  // 펜촉
  ctx.fillStyle = "#2A2A2E";
  ctx.beginPath();
  ctx.moveTo(-3, 0);
  ctx.lineTo(3, 0);
  ctx.lineTo(0, 10);
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

    if (objects.length === 0) {
      // 객체 정보 없으면 전체를 좌→우로 점진 공개
      const progress = clamp01(t / Math.max(scene.durationSec, 0.5));
      const w = fit.drawW * ease(progress);
      ctx.save();
      ctx.beginPath();
      ctx.rect(fit.offsetX, fit.offsetY, w, fit.drawH);
      ctx.clip();
      ctx.drawImage(image, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH);
      ctx.restore();
    } else {
      // 공개된 모든 영역을 union clip 후 이미지 그리기
      ctx.save();
      ctx.beginPath();
      let any = false;
      for (const obj of objects) {
        const start = obj.startAt ?? 0;
        const end = obj.endAt ?? start + 1;
        const progress = clamp01((t - start) / Math.max(end - start, 0.01));
        const rect = revealedRect(obj, progress, fit);
        if (rect) {
          ctx.rect(rect[0], rect[1], rect[2], rect[3]);
          any = true;
        }
      }
      if (any) {
        ctx.clip();
        ctx.drawImage(image, fit.offsetX, fit.offsetY, fit.drawW, fit.drawH);
      }
      ctx.restore();
    }

    // 손 애니메이션
    if (opts.showHand !== false && scene.hand?.enabled) {
      const pos = handPosition(objects, t, fit);
      if (pos) drawHand(ctx, pos, scene.hand.asset);
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
