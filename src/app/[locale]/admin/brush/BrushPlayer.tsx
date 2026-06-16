"use client";

import { useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from "react";
import { SceneSpec, BrushType } from "@/lib/types";
import { renderSceneFrame, ASPECT_SIZES } from "@/lib/render/renderCore";

export interface BrushPlayerHandle {
  /** 재생을 처음부터 녹화해 영상+나레이션으로 다운로드 (mp4 지원 시 mp4, 아니면 webm) */
  record(): Promise<void>;
}

const BrushPlayer = forwardRef<BrushPlayerHandle, {
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
  showBoxes?: boolean;
  inkSpread?: number;
  fillRange?: number;
}>(function BrushPlayer({
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
  showBoxes,
  inkSpread,
  fillRange,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  // 오디오 엘리먼트는 ref로 유지 — audioUrl 바뀔 때만 교체
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const size = useMemo(() => {
    // 분석 후엔 선택한 화면 비율(scene.canvas.aspect)을 캔버스 기준으로 — 실제 영상과 동일.
    // (이미지는 renderCore가 contain-fit. 분석 전에는 업로드 이미지 비율로 미리보기)
    if (scene?.canvas?.aspect) {
      return ASPECT_SIZES[scene.canvas.aspect] ?? ASPECT_SIZES["9:16"];
    }
    if (image && image.width > 0 && image.height > 0) {
      const LONG = 1600;
      const r = image.width / image.height;
      return r >= 1
        ? { width: LONG, height: Math.round(LONG / r) }
        : { width: Math.round(LONG * r), height: LONG };
    }
    return ASPECT_SIZES["9:16"];
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
        inkSpread: inkSpread ?? scene.hand?.inkSpread,
        fillRange: fillRange ?? scene.hand?.fillRange,
      },
    };
    const renderOpts = { noFinalImage: true, debugBoxes: showBoxes };
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
  }, [scene, image, playing, brushSize, brushCount, brushSpeed, showBrush, brushType, handAsset, showBoxes, size, inkSpread, fillRange]);

  // 녹화: 캔버스 스트림 + 나레이션 오디오 → webm 다운로드
  useImperativeHandle(ref, () => ({
    async record() {
      const canvas = canvasRef.current;
      if (!canvas || !scene) return;

      // 처음부터 재생 재시작 (메인 오디오는 멈추고 녹화 전용 오디오 사용 —
      // createMediaElementSource는 엘리먼트당 1회 제한이라 매번 새로 만든다)
      audioRef.current?.pause();
      startRef.current = 0;

      const canvasStream = canvas.captureStream(30);
      let stream = canvasStream;
      let ac: AudioContext | null = null;
      let recAudio: HTMLAudioElement | null = null;

      if (audioUrl) {
        recAudio = new Audio(audioUrl);
        ac = new AudioContext();
        const src = ac.createMediaElementSource(recAudio);
        const dest = ac.createMediaStreamDestination();
        src.connect(dest);
        src.connect(ac.destination); // 녹화 중에도 들리게
        stream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...dest.stream.getAudioTracks(),
        ]);
      }

      // mp4 지원 브라우저(최신 Chrome/Safari)면 mp4 우선, 아니면 webm 폴백
      const mime = [
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });

      rec.start(250);
      recAudio?.play().catch(() => {});

      // 장면 길이 + 여유 0.8초 녹화
      const durMs = ((scene.durationSec || 8) + 0.8) * 1000;
      await new Promise((r) => setTimeout(r, durMs));

      rec.stop();
      await stopped;
      recAudio?.pause();
      ac?.close();

      const blob = new Blob(chunks, { type: mime || "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `brush-test-${Date.now()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    },
  }), [scene, audioUrl]);

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
});

export default BrushPlayer;
