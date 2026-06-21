"use client";

// 시네마그래프 테스트 (독립 페이지 — 다른 시스템 무영향, 전부 클라이언트·비용 0).
// 이미지 업로드 → 객체 분리(자동 누끼 or 수동 박스) → 그 레이어만 미세 모션 → 정지 배경 위 루프.
// @imgly/background-removal은 핸들러 안에서 동적 import → 이 페이지 진입 시에만 로드.

import { useRef, useState, useEffect, useCallback } from "react";

type Mode = "auto" | "box";
interface Box { x: number; y: number; w: number; h: number } // 표시(캔버스) 좌표

const MAX_W = 720; // 미리보기 최대 폭

export default function CinemagraphTestPage() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fg, setFg] = useState<HTMLImageElement | null>(null); // 누끼 컷아웃(알파)
  const [mode, setMode] = useState<Mode>("auto");
  const [box, setBox] = useState<Box | null>(null);
  const [cutting, setCutting] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [recording, setRecording] = useState(false);
  const [err, setErr] = useState("");

  // 모션 파라미터
  const [floatAmp, setFloatAmp] = useState(6);   // 부유(원형 드리프트) px
  const [bobAmp, setBobAmp] = useState(0);        // 상하 px
  const [swayAmp, setSwayAmp] = useState(0);      // 좌우 px
  const [breatheAmp, setBreatheAmp] = useState(2);// 호흡(줌) %
  const [tiltAmp, setTiltAmp] = useState(0);      // 기울임 도(deg)
  const [speed, setSpeed] = useState(1);          // 전체 속도 배율

  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ sx: number; sy: number } | null>(null);

  // 표시 크기 계산
  const dim = img ? fitDim(img.width, img.height) : { w: MAX_W, h: Math.round(MAX_W * 1.4) };

  function onFile(f: File | null) {
    if (!f) return;
    setErr(""); setFg(null); setBox(null);
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => setImg(im);
      im.src = r.result as string;
    };
    r.readAsDataURL(f);
  }

  // 자동 누끼 — @imgly/background-removal (브라우저 WASM, 무료). 첫 실행 시 모델 다운로드.
  async function runAutoCutout() {
    if (!img || cutting) return;
    setCutting(true); setErr("");
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const blob = await removeBackground(img.src);
      const url = URL.createObjectURL(blob);
      const cut = new Image();
      cut.onload = () => { setFg(cut); setCutting(false); };
      cut.onerror = () => { setErr("컷아웃 로드 실패"); setCutting(false); };
      cut.src = url;
    } catch (e) {
      setErr("누끼 실패: " + (e instanceof Error ? e.message : String(e)));
      setCutting(false);
    }
  }

  // 수동 박스 드래그
  function onDown(e: React.MouseEvent) {
    if (mode !== "box" || !img) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    dragRef.current = { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }
  function onMove(e: React.MouseEvent) {
    if (!dragRef.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const { sx, sy } = dragRef.current;
    setBox({ x: Math.min(sx, cx), y: Math.min(sy, cy), w: Math.abs(cx - sx), h: Math.abs(cy - sy) });
  }
  function onUp() { dragRef.current = null; }

  // 애니메이션 루프
  const draw = useCallback((tMs: number) => {
    const cv = canvasRef.current; if (!cv || !img) return;
    const ctx = cv.getContext("2d")!;
    const { w, h } = dim;
    const t = (tMs / 1000) * speed;
    const sx = img.width / w, sy = img.height / h; // 표시→원본 스케일

    ctx.clearRect(0, 0, w, h);
    // 1) 정지 배경(원본 전체)
    ctx.drawImage(img, 0, 0, w, h);

    // 2) 움직일 레이어 = 누끼(fg) 또는 박스 크롭
    const ox = Math.sin(t * 1.1) * floatAmp + Math.sin(t * 0.9) * swayAmp;
    const oy = Math.cos(t * 0.8) * floatAmp + Math.sin(t * 1.3) * bobAmp;
    const scale = 1 + Math.sin(t * 0.7) * (breatheAmp / 100);
    const rot = Math.sin(t * 0.6) * (tiltAmp * Math.PI / 180);

    if (mode === "auto" && fg) {
      const cx = w / 2, cy = h / 2;
      ctx.save();
      ctx.translate(cx + ox, cy + oy);
      ctx.rotate(rot); ctx.scale(scale, scale);
      ctx.drawImage(fg, -cx, -cy, w, h);
      ctx.restore();
    } else if (mode === "box" && box && box.w > 4 && box.h > 4) {
      const bx = box.x * sx, by = box.y * sy, bw = box.w * sx, bh = box.h * sy; // 원본 좌표
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      ctx.save();
      ctx.translate(cx + ox, cy + oy);
      ctx.rotate(rot); ctx.scale(scale, scale);
      ctx.drawImage(img, bx, by, bw, bh, -box.w / 2, -box.h / 2, box.w, box.h);
      ctx.restore();
      if (!playing) { // 정지 중엔 박스 가이드
        ctx.strokeStyle = "rgba(220,60,60,0.9)"; ctx.lineWidth = 2;
        ctx.strokeRect(box.x, box.y, box.w, box.h);
      }
    }
  }, [img, fg, box, mode, dim, floatAmp, bobAmp, swayAmp, breatheAmp, tiltAmp, speed, playing]);

  useEffect(() => {
    if (!img) return;
    let start = performance.now();
    const loop = (now: number) => {
      draw(playing ? now - start : 0);
      rafRef.current = requestAnimationFrame(loop);
    };
    if (!playing) { start = performance.now(); draw(0); return; }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [img, playing, draw]);

  // webm 녹화 (5초)
  async function record() {
    const cv = canvasRef.current; if (!cv || recording) return;
    setRecording(true);
    try {
      setPlaying(true);
      await new Promise((r) => setTimeout(r, 120));
      const stream = cv.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const url = URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
        const a = document.createElement("a"); a.href = url; a.download = "cinemagraph.webm"; a.click();
        setRecording(false);
      };
      rec.start();
      setTimeout(() => rec.stop(), 5000);
    } catch {
      setErr("녹화 실패(브라우저 미지원일 수 있음)"); setRecording(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--ink)] mb-1">시네마그래프 테스트</h1>
      <p className="text-sm text-[var(--ink-soft)] mb-6">
        이미지를 올리고 객체를 분리해(자동 누끼 또는 박스 지정) 그 부분만 미세하게 움직이는 시네마그래프를 즉시 미리봅니다.
        전부 브라우저에서 처리 — <b>생성 비용 0</b>.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 좌: 컨트롤 */}
        <div className="flex flex-col gap-4">
          <div onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-[var(--line)] rounded-[var(--radius)] p-6 text-center cursor-pointer hover:border-[var(--accent)]">
            {img ? <span className="text-sm text-[var(--ink-soft)]">이미지 변경 ({img.width}×{img.height})</span>
                 : <span className="text-sm text-[var(--ink-soft)]">이미지 클릭/드롭하여 업로드</span>}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--ink)]">움직일 부분 선택</label>
            <div className="grid grid-cols-2 gap-1 mt-1">
              <button onClick={() => setMode("auto")}
                className={`px-2 py-1.5 rounded text-xs border ${mode === "auto" ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--line)] text-[var(--ink)]"}`}>
                자동 누끼 (전경 객체)
              </button>
              <button onClick={() => setMode("box")}
                className={`px-2 py-1.5 rounded text-xs border ${mode === "box" ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-[var(--line)] text-[var(--ink)]"}`}>
                수동 박스 (드래그)
              </button>
            </div>
            {mode === "auto" && (
              <button onClick={runAutoCutout} disabled={!img || cutting}
                className="mt-2 px-4 py-2 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50">
                {cutting ? "분리 중… (첫 실행은 모델 다운로드)" : fg ? "다시 분리" : "객체 분리(누끼)"}
              </button>
            )}
            {mode === "box" && <p className="text-xs text-[var(--ink-faint)] mt-2">오른쪽 미리보기에서 움직일 영역을 드래그하세요.</p>}
          </div>

          {/* 모션 슬라이더 */}
          {[
            ["부유(떠다님)", floatAmp, setFloatAmp, 0, 20, 1, "px"],
            ["상하 흔들", bobAmp, setBobAmp, 0, 20, 1, "px"],
            ["좌우 흔들", swayAmp, setSwayAmp, 0, 20, 1, "px"],
            ["호흡(줌)", breatheAmp, setBreatheAmp, 0, 8, 0.5, "%"],
            ["기울임", tiltAmp, setTiltAmp, 0, 5, 0.5, "°"],
            ["속도", speed, setSpeed, 0.2, 3, 0.1, "×"],
          ].map(([label, val, setter, min, max, step, unit]) => (
            <div key={label as string} className="flex items-center gap-3">
              <label className="text-sm text-[var(--ink)] w-20">{label as string}</label>
              <input type="range" min={min as number} max={max as number} step={step as number} value={val as number}
                onChange={(e) => (setter as (n: number) => void)(Number(e.target.value))}
                className="flex-1 accent-[var(--accent)]" />
              <span className="text-sm tabular-nums w-12 text-right">{(val as number)}{unit as string}</span>
            </div>
          ))}

          <div className="flex gap-2">
            <button onClick={() => setPlaying((p) => !p)} className="px-5 py-2.5 rounded-[var(--radius)] border border-[var(--line)] text-sm font-medium">
              {playing ? "⏸ 정지" : "▶ 재생"}
            </button>
            <button onClick={record} disabled={recording || !img}
              className="px-5 py-2.5 rounded-[var(--radius)] border border-[var(--line)] text-sm font-medium disabled:opacity-50">
              {recording ? "녹화 중…(5초)" : "⬇ webm 녹화"}
            </button>
          </div>
          {err && <p className="text-sm text-[var(--accent)]">{err}</p>}
          <p className="text-[11px] text-[var(--ink-faint)]">
            * 미세 모션이라 객체 뒤 빈 공간은 거의 안 보입니다. 크게 움직이면 배경 채움이 필요해 부자연스러울 수 있어요(시네마그래프는 원래 작은 움직임).
          </p>
        </div>

        {/* 우: 미리보기 */}
        <div>
          <canvas ref={canvasRef} width={dim.w} height={dim.h}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            className="w-full rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper-sunken)]"
            style={{ cursor: mode === "box" ? "crosshair" : "default" }} />
          {!img && <p className="text-xs text-[var(--ink-faint)] mt-2 text-center">이미지를 업로드하면 여기에 미리보기가 나옵니다.</p>}
        </div>
      </div>
    </div>
  );
}

function fitDim(iw: number, ih: number) {
  const scale = Math.min(MAX_W / iw, 1);
  return { w: Math.round(iw * scale), h: Math.round(ih * scale) };
}
