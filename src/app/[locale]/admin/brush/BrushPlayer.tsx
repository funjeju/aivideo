"use client";

import { useEffect, useRef, useMemo } from "react";
import { SceneSpec } from "@/lib/types";
import { renderSceneFrame, ASPECT_SIZES } from "@/lib/render/renderCore";

/** 오디오 없이 sceneSpec 1개를 rAF로 재생하는 붓 모션 미리보기 */
export default function BrushPlayer({
  scene,
  image,
  playing,
  brushSize,
  brushCount,
  brushSpeed,
  showBrush,
}: {
  scene: SceneSpec | null;
  image: HTMLImageElement | null;
  playing: boolean;
  brushSize: number;
  brushCount: number;
  brushSpeed: number;
  showBrush: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  // 테스트 모드: 캔버스를 업로드 이미지의 실제 비율에 맞춤 (이미지가 꽉 차게)
  const size = useMemo(() => {
    if (image && image.width > 0 && image.height > 0) {
      const LONG = 1600;
      const r = image.width / image.height;
      return r >= 1
        ? { width: LONG, height: Math.round(LONG / r) }
        : { width: Math.round(LONG * r), height: LONG };
    }
    return ASPECT_SIZES[scene?.canvas?.aspect ?? "9:16"] ?? ASPECT_SIZES["9:16"];
  }, [image, scene?.canvas?.aspect]);

  useEffect(() => {
    if (!scene || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c = ctx;

    // hand.size를 슬라이더 값으로 덮어써 즉시 반영
    const liveScene: SceneSpec = { ...scene, hand: { ...(scene.hand ?? { enabled: true, asset: "brush" }), enabled: showBrush, size: brushSize, count: brushCount, speed: brushSpeed } };
    // 테스트: 완성본 점프 없이 끝까지 그림 (속도 슬라이더로 완급 조절)
    const renderOpts = { noFinalImage: true };
    const LOOP = 60; // 충분히 길게 두고, 다 그린 뒤엔 그대로 유지하다 리셋

    function frame(now: number) {
      if (!startRef.current) startRef.current = now;
      let t = (now - startRef.current) / 1000;
      if (t > LOOP) { startRef.current = now; t = 0; }
      renderSceneFrame(c, liveScene, image ?? undefined as never, t, size, renderOpts);
      rafRef.current = requestAnimationFrame(frame);
    }

    if (playing) {
      startRef.current = 0;
      rafRef.current = requestAnimationFrame(frame);
    } else {
      // 정지: 완성본 표시
      renderSceneFrame(c, liveScene, image ?? undefined as never, 999, size, renderOpts);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [scene, image, playing, brushSize, brushCount, brushSpeed, showBrush, size]);

  return (
    <div className="bg-[var(--stage-bg)] rounded-[var(--radius)] p-4 flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        className="max-h-[70vh] max-w-full w-auto h-auto object-contain rounded shadow-lg bg-white"
        style={{ aspectRatio: `${size.width}/${size.height}` }}
      />
    </div>
  );
}
