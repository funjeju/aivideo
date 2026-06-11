"use client";

import { useEffect, useRef } from "react";
import { SceneSpec } from "@/lib/types";
import {
  renderSceneFrame,
  buildTimeline,
  totalDuration,
  findSceneAt,
  ASPECT_SIZES,
  TimelineEntry,
} from "@/lib/render/renderCore";

type LoadedImage = HTMLImageElement;

declare global {
  interface Window {
    /** 장면 주입 + 이미지 프리로드. resolve 시 렌더 준비 완료. */
    __loadScenes?: (scenes: SceneSpec[]) => Promise<{ total: number; width: number; height: number }>;
    /** 특정 globalT(초) 프레임을 캔버스에 그림 */
    __seek?: (t: number) => void;
    /** 현재 캔버스를 PNG dataURL로 반환 */
    __getFrame?: () => string;
    /** 렌더 준비 여부 */
    __renderReady?: boolean;
  }
}

export default function RenderStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<TimelineEntry[]>([]);
  const imagesRef = useRef<Map<string, LoadedImage>>(new Map());
  const sizeRef = useRef(ASPECT_SIZES["9:16"]);

  useEffect(() => {
    window.__renderReady = false;

    window.__loadScenes = (scenes: SceneSpec[]) => {
      return new Promise((resolve) => {
        timelineRef.current = buildTimeline(scenes);
        const aspect = scenes[0]?.canvas?.aspect ?? "9:16";
        const size = ASPECT_SIZES[aspect] ?? ASPECT_SIZES["9:16"];
        sizeRef.current = size;

        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = size.width;
          canvas.height = size.height;
        }

        const urls = Array.from(
          new Set(scenes.map((s) => s.image?.url).filter(Boolean) as string[])
        );
        if (urls.length === 0) {
          window.__renderReady = true;
          resolve({ total: totalDuration(scenes), ...size });
          return;
        }

        let loaded = 0;
        const done = () => {
          loaded++;
          if (loaded >= urls.length) {
            window.__renderReady = true;
            resolve({ total: totalDuration(scenes), ...size });
          }
        };
        urls.forEach((url) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => { imagesRef.current.set(url, img); done(); };
          img.onerror = done;
          img.src = url;
        });
      });
    };

    window.__seek = (t: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const found = findSceneAt(timelineRef.current, t);
      if (!found) return;
      const { entry, localT } = found;
      const img = entry.scene.image?.url
        ? imagesRef.current.get(entry.scene.image.url)
        : undefined;
      renderSceneFrame(
        ctx,
        entry.scene,
        img as (CanvasImageSource & { width: number; height: number }) | undefined,
        localT,
        sizeRef.current
      );
    };

    window.__getFrame = () => {
      return canvasRef.current?.toDataURL("image/png") ?? "";
    };

    return () => {
      delete window.__loadScenes;
      delete window.__seek;
      delete window.__getFrame;
      window.__renderReady = false;
    };
  }, []);

  return (
    <div style={{ margin: 0, padding: 0, background: "#000" }}>
      <canvas ref={canvasRef} id="render-canvas" style={{ display: "block" }} />
    </div>
  );
}
