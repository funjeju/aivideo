"use client";

import { useEffect, useRef, useMemo } from "react";
import { SceneSpec, BrushType } from "@/lib/types";
import { renderSceneFrame, ASPECT_SIZES } from "@/lib/render/renderCore";

export default function BrushPlayer({
  scene,
  image,
  playing,
  brushSize,
  brushCount,
  brushSpeed,
  showBrush,
  audioUrl,
  brushType,
  handAsset,
}: {
  scene: SceneSpec | null;
  image: HTMLImageElement | null;
  playing: boolean;
  brushSize: number;
  brushCount: number;
  brushSpeed: number;
  showBrush: boolean;
  audioUrl?: string;
  brushType?: BrushType;
  handAsset?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  // 오디오 엘리먼트는 ref로 유지 — audioUrl 바뀔 때만 교체
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // audioUrl 바뀌면 Audio 객체 교체
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.preload = "auto";
      audioRef.current = audio;
    }
    return () => {
      audioRef.current?.pause();
    };
  }, [audioUrl]);

  useEffect(() => {
    if (!scene || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c = ctx;

    const liveScene: SceneSpec = {
      ...scene,
      hand: {
        ...(scene.hand ?? { enabled: true, asset: "brush" }),
        enabled: showBrush,
        asset: handAsset ?? scene.hand?.asset ?? "brush",
        size: brushSize,
        count: brushCount,
        speed: brushSpeed,
        brushType: brushType ?? "round",
      },
    };
    const renderOpts = { noFinalImage: true };
    const LOOP = 120;

    cancelAnimationFrame(rafRef.current);

    if (!playing) {
      audioRef.current?.pause();
      renderSceneFrame(c, liveScene, image ?? undefined as never, 999, size, renderOpts);
      return;
    }

    // 재생 시작
    startRef.current = 0;
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }

    function frame(now: number) {
      let t: number;
      const audio = audioRef.current;
      if (audio && !audio.paused && !audio.ended) {
        t = audio.currentTime;
      } else {
        if (!startRef.current) startRef.current = now;
        t = (now - startRef.current) / 1000;
        if (t > LOOP) { startRef.current = now; t = 0; }
      }
      renderSceneFrame(c, liveScene, image ?? undefined as never, t, size, renderOpts);
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.pause();
    };
  }, [scene, image, playing, brushSize, brushCount, brushSpeed, showBrush, brushType, handAsset, size]);

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
