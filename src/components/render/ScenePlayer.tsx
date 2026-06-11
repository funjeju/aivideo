"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { SceneSpec } from "@/lib/types";
import {
  renderSceneFrame,
  buildTimeline,
  totalDuration,
  findSceneAt,
  ASPECT_SIZES,
  TimelineEntry,
} from "@/lib/render/renderCore";

interface ScenePlayerProps {
  scenes: SceneSpec[];
  className?: string;
}

/** Scene Spec 배열을 브라우저에서 드로잉-리빌 재생 */
export default function ScenePlayer({ scenes, className }: ScenePlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const rafRef = useRef<number>(0);
  const timelineRef = useRef<TimelineEntry[]>([]);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [globalT, setGlobalT] = useState(0);
  const [sceneIdx, setSceneIdx] = useState(0);

  const aspect = scenes[0]?.canvas?.aspect ?? "9:16";
  const size = ASPECT_SIZES[aspect] ?? ASPECT_SIZES["9:16"];
  const total = totalDuration(scenes);

  // 타임라인 + 이미지 프리로드
  useEffect(() => {
    timelineRef.current = buildTimeline(scenes);
    let cancelled = false;
    const urls = scenes.map((s) => s.image?.url).filter(Boolean) as string[];
    let loaded = 0;

    if (urls.length === 0) {
      setReady(true);
      return;
    }

    urls.forEach((url) => {
      if (imagesRef.current.has(url)) {
        loaded++;
        if (loaded === urls.length && !cancelled) setReady(true);
        return;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        imagesRef.current.set(url, img);
        loaded++;
        if (loaded === urls.length && !cancelled) setReady(true);
      };
      img.onerror = () => {
        loaded++;
        if (loaded === urls.length && !cancelled) setReady(true);
      };
      img.src = url;
    });

    return () => { cancelled = true; };
  }, [scenes]);

  // 프레임 그리기
  const drawAt = useCallback(
    (gT: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const found = findSceneAt(timelineRef.current, gT);
      if (!found) {
        ctx.fillStyle = "#FAF8F4";
        ctx.fillRect(0, 0, size.width, size.height);
        return;
      }
      const { entry, localT } = found;
      const img = entry.scene.image?.url
        ? imagesRef.current.get(entry.scene.image.url)
        : undefined;
      renderSceneFrame(
        ctx,
        entry.scene,
        img as (CanvasImageSource & { width: number; height: number }) | undefined,
        localT,
        size
      );
    },
    [size]
  );

  // 재생 루프 (오디오 기준 동기화)
  useEffect(() => {
    if (!playing) return;

    function loop() {
      const audio = audioRef.current;
      const entry = timelineRef.current[sceneIdx];
      if (audio && entry) {
        const gT = entry.startTime + audio.currentTime;
        setGlobalT(gT);
        drawAt(gT);
      }
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, sceneIdx, drawAt]);

  // 정지 상태에서 스크럽 시 그리기
  useEffect(() => {
    if (!playing) drawAt(globalT);
  }, [globalT, playing, drawAt, ready]);

  function handlePlay() {
    const audio = audioRef.current;
    const entry = timelineRef.current[sceneIdx];
    if (!audio || !entry) return;
    const url = entry.scene.audioUrl;
    if (url && audio.src !== url) audio.src = url;
    audio.play().catch(() => {});
    setPlaying(true);
  }

  function handlePause() {
    audioRef.current?.pause();
    setPlaying(false);
  }

  function handleAudioEnded() {
    const nextIdx = sceneIdx + 1;
    if (nextIdx < scenes.length) {
      setSceneIdx(nextIdx);
      const audio = audioRef.current;
      const entry = timelineRef.current[nextIdx];
      if (audio && entry?.scene.audioUrl) {
        audio.src = entry.scene.audioUrl;
        audio.play().catch(() => {});
      }
    } else {
      setPlaying(false);
      setSceneIdx(0);
    }
  }

  function handleScrub(e: React.ChangeEvent<HTMLInputElement>) {
    const gT = Number(e.target.value);
    handlePause();
    setGlobalT(gT);
    const found = findSceneAt(timelineRef.current, gT);
    if (found) {
      const idx = timelineRef.current.indexOf(found.entry);
      setSceneIdx(idx);
      const audio = audioRef.current;
      if (audio && found.entry.scene.audioUrl) {
        audio.src = found.entry.scene.audioUrl;
        audio.currentTime = found.localT;
      }
    }
  }

  return (
    <div className={className}>
      {/* 캔버스 — 주변만 다크 스테이지 */}
      <div className="bg-[var(--stage-bg)] rounded-[var(--radius)] p-6 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={size.width}
          height={size.height}
          className="max-h-[60vh] w-auto rounded shadow-lg"
          style={{ aspectRatio: `${size.width}/${size.height}` }}
        />
      </div>

      {/* 컨트롤 */}
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={playing ? handlePause : handlePlay}
          disabled={!ready}
          className="w-10 h-10 rounded-full bg-[var(--accent)] text-white flex items-center justify-center disabled:opacity-50"
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={total}
          step={0.05}
          value={globalT}
          onChange={handleScrub}
          className="flex-1 accent-[var(--accent)]"
        />
        <span className="text-xs text-[var(--ink-faint)] tabular-nums w-16 text-right">
          {globalT.toFixed(1)} / {total.toFixed(1)}s
        </span>
      </div>

      <audio ref={audioRef} onEnded={handleAudioEnded} className="hidden" />
    </div>
  );
}
