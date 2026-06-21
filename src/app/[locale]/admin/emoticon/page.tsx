"use client";

// 이모티콘 테스트 (독립 페이지 — 다른 시스템 무영향).
// 단계: 1) 시트 준비(생성 or 업로드) → 2) 슬라이스(그리드 지정·미리보기) → 3) 누끼+GIF 루프.
// 슬라이스부터는 전부 브라우저 처리(비용 0). 생성만 gpt-image-2 low.

import { useRef, useState } from "react";

export default function EmoticonTestPage() {
  // 1) 생성
  const [character, setCharacter] = useState("");
  const [action, setAction] = useState("손을 흔드는 동작 (wave hand)");
  const [genFrames, setGenFrames] = useState(4);
  const [refDataUrl, setRefDataUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [genCost, setGenCost] = useState<{ usd: number; krw: number } | null>(null);

  // 활성 시트 + 그리드
  const [sheetUrl, setSheetUrl] = useState("");
  const [cols, setCols] = useState(2);
  const [rows, setRows] = useState(2);

  // 2) 슬라이스 미리보기
  const [frameThumbs, setFrameThumbs] = useState<string[]>([]);

  // 3) GIF
  const [useCutout, setUseCutout] = useState(true);
  const [delayMs, setDelayMs] = useState(250);
  const [making, setMaking] = useState(false);
  const [gifUrl, setGifUrl] = useState("");

  const [err, setErr] = useState("");
  const refRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLInputElement>(null);

  function loadImg(src: string): Promise<HTMLImageElement> {
    return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = rej; im.src = src; });
  }
  function fileToDataUrl(f: File): Promise<string> {
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(f); });
  }
  function resetDownstream() { setFrameThumbs([]); setGifUrl(""); }

  // 1) 생성 → 시트
  async function generate() {
    if (loading) return;
    setLoading(true); setErr(""); setGenCost(null); resetDownstream();
    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      const res = await fetch("/api/admin/emoticon-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ character, action, frames: genFrames, refDataUrl: refDataUrl || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "생성 실패"); return; }
      setSheetUrl(d.image);
      setCols(genFrames === 4 ? 2 : 3);
      setRows(genFrames === 9 ? 3 : 2);
      setGenCost({ usd: d.costUsd, krw: d.costKrw });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류");
    } finally {
      setLoading(false);
    }
  }

  // 1') 기존 시트 업로드 → 시트
  async function onUploadSheet(f: File | null) {
    if (!f) return;
    setErr(""); setGenCost(null); resetDownstream();
    setSheetUrl(await fileToDataUrl(f));
  }

  // 2) 슬라이스 미리보기
  async function sliceFrames(): Promise<HTMLCanvasElement[]> {
    const sheet = await loadImg(sheetUrl);
    const cw = sheet.width / cols, ch = sheet.height / rows;
    const T = 320;
    const out: HTMLCanvasElement[] = [];
    for (let i = 0; i < cols * rows; i++) {
      const sx = (i % cols) * cw, sy = Math.floor(i / cols) * ch;
      const cv = document.createElement("canvas"); cv.width = T; cv.height = T;
      const ctx = cv.getContext("2d")!;
      const scale = Math.min(T / cw, T / ch);
      const dw = cw * scale, dh = ch * scale, dx = (T - dw) / 2, dy = (T - dh) / 2;
      ctx.drawImage(sheet, sx, sy, cw, ch, dx, dy, dw, dh);
      out.push(cv);
    }
    return out;
  }
  async function previewSlice() {
    if (!sheetUrl) return;
    setErr("");
    try { const cvs = await sliceFrames(); setFrameThumbs(cvs.map((c) => c.toDataURL("image/png"))); setGifUrl(""); }
    catch (e) { setErr("슬라이스 실패: " + (e instanceof Error ? e.message : String(e))); }
  }

  // 3) 누끼 + GIF 루프
  async function makeGif() {
    if (!sheetUrl || making) return;
    setMaking(true); setErr(""); setGifUrl("");
    try {
      const cells = await sliceFrames();
      const T = 320;
      const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
      const gif = GIFEncoder();
      const remove = useCutout ? (await import("@imgly/background-removal")).removeBackground : null;
      for (const cell of cells) {
        let frameCv = cell;
        if (remove) {
          const blob = await remove(cell.toDataURL("image/png"));
          const cut = await loadImg(URL.createObjectURL(blob));
          const fc = document.createElement("canvas"); fc.width = T; fc.height = T;
          fc.getContext("2d")!.drawImage(cut, 0, 0, T, T);
          frameCv = fc;
        } else {
          // 흰 배경 깔기(투명 영역 방지)
          const fc = document.createElement("canvas"); fc.width = T; fc.height = T;
          const fx = fc.getContext("2d")!; fx.fillStyle = "#fff"; fx.fillRect(0, 0, T, T); fx.drawImage(cell, 0, 0);
          frameCv = fc;
        }
        const data = frameCv.getContext("2d")!.getImageData(0, 0, T, T).data;
        const fmt = remove ? "rgba4444" : "rgb565";
        const palette = quantize(data, 256, { format: fmt });
        const index = applyPalette(data, palette, fmt);
        gif.writeFrame(index, T, T, { palette, delay: delayMs, transparent: !!remove });
      }
      gif.finish();
      const blob = new Blob([gif.bytes() as BlobPart], { type: "image/gif" });
      setGifUrl(URL.createObjectURL(blob));
    } catch (e) {
      setErr("GIF 실패: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setMaking(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold text-[var(--ink)] mb-1">이모티콘 테스트 (스프라이트 시트 → GIF)</h1>
      <p className="text-sm text-[var(--ink-soft)] mb-6">
        시트를 <b>생성</b>하거나 <b>이미 있는 시트를 업로드</b> → 그리드로 <b>슬라이스</b> → <b>누끼+GIF 루프</b>.
        슬라이스부터는 전부 브라우저(비용 0).
      </p>

      {/* ── 1) 시트 준비 ── */}
      <section className="mb-6 border border-[var(--line)] rounded-[var(--radius)] p-4">
        <p className="text-sm font-semibold text-[var(--ink)] mb-3">① 시트 준비</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 생성 */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-[var(--ink-soft)]">A. 새로 생성 (gpt-image-2 low)</p>
            <div onClick={() => refRef.current?.click()}
              className="border-2 border-dashed border-[var(--line)] rounded p-3 text-center cursor-pointer hover:border-[var(--accent)]">
              {refDataUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={refDataUrl} alt="ref" className="max-h-24 mx-auto rounded" />
                : <span className="text-xs text-[var(--ink-soft)]">참조 캐릭터 업로드 (선택)</span>}
              <input ref={refRef} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setRefDataUrl(await fileToDataUrl(f)); }} />
            </div>
            <textarea value={character} onChange={(e) => setCharacter(e.target.value)} rows={2} placeholder="캐릭터 묘사 (예: 노란 병아리, 큰 눈)"
              className="p-2 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm text-[var(--ink)]" />
            <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="동작"
              className="p-2 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm text-[var(--ink)]" />
            <div className="flex items-center gap-2">
              <label className="text-sm text-[var(--ink)]">프레임</label>
              <select value={genFrames} onChange={(e) => setGenFrames(Number(e.target.value))} className="px-2 py-1 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm">
                <option value={4}>4 (2x2)</option><option value={6}>6 (2x3)</option><option value={9}>9 (3x3)</option>
              </select>
              <button onClick={generate} disabled={loading} className="ml-auto px-4 py-2 rounded bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50">
                {loading ? "생성 중…" : "시트 생성"}
              </button>
            </div>
            {genCost && <p className="text-[11px] text-[var(--ink-faint)]">원가 ${genCost.usd} (≈₩{genCost.krw})</p>}
          </div>
          {/* 업로드 */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-[var(--ink-soft)]">B. 기존 시트 업로드 (바로 슬라이스로)</p>
            <div onClick={() => sheetRef.current?.click()}
              className="border-2 border-dashed border-[var(--line)] rounded p-6 text-center cursor-pointer hover:border-[var(--accent)] flex-1 flex items-center justify-center">
              <span className="text-sm text-[var(--ink-soft)]">스프라이트 시트 이미지 클릭/드롭하여 업로드</span>
              <input ref={sheetRef} type="file" accept="image/*" className="hidden" onChange={(e) => onUploadSheet(e.target.files?.[0] ?? null)} />
            </div>
            <p className="text-[11px] text-[var(--ink-faint)]">업로드하면 아래에서 칸 수(열·행)를 직접 지정해 슬라이스하세요.</p>
          </div>
        </div>
      </section>

      {sheetUrl && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 활성 시트 + 슬라이스 */}
          <section className="border border-[var(--line)] rounded-[var(--radius)] p-4">
            <p className="text-sm font-semibold text-[var(--ink)] mb-2">② 슬라이스</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sheetUrl} alt="sheet" className="w-full rounded border border-[var(--line)] mb-3" />
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm text-[var(--ink)]">열(가로)
                <input type="number" min={1} max={8} value={cols} onChange={(e) => { setCols(Math.max(1, Number(e.target.value) || 1)); resetDownstream(); }}
                  className="ml-1 w-14 px-2 py-1 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm" /></label>
              <label className="text-sm text-[var(--ink)]">행(세로)
                <input type="number" min={1} max={8} value={rows} onChange={(e) => { setRows(Math.max(1, Number(e.target.value) || 1)); resetDownstream(); }}
                  className="ml-1 w-14 px-2 py-1 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm" /></label>
              <span className="text-xs text-[var(--ink-faint)]">= {cols * rows}프레임</span>
              <button onClick={previewSlice} className="ml-auto px-3 py-1.5 rounded border border-[var(--line)] text-sm">슬라이스 미리보기</button>
            </div>
            {frameThumbs.length > 0 && (
              <div className="grid grid-cols-4 gap-1 mt-3">
                {frameThumbs.map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={u} alt={`f${i}`} className="w-full rounded border border-[var(--line)] bg-[var(--paper-sunken)]" />
                ))}
              </div>
            )}
          </section>

          {/* GIF */}
          <section className="border border-[var(--line)] rounded-[var(--radius)] p-4">
            <p className="text-sm font-semibold text-[var(--ink)] mb-2">③ 누끼 + GIF 루프</p>
            <div className="flex items-center gap-4 flex-wrap mb-3">
              <label className="flex items-center gap-2 text-sm text-[var(--ink)] cursor-pointer">
                <input type="checkbox" checked={useCutout} onChange={(e) => setUseCutout(e.target.checked)} className="accent-[var(--accent)]" />
                누끼(투명)
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
                속도 <input type="range" min={80} max={500} step={10} value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value))} className="accent-[var(--accent)]" />
                <span className="text-xs tabular-nums w-12">{delayMs}ms</span>
              </label>
              <button onClick={makeGif} disabled={making} className="ml-auto px-4 py-2 rounded bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50">
                {making ? "만드는 중…" : "GIF 만들기"}
              </button>
            </div>
            {gifUrl ? (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gifUrl} alt="gif" className="h-44 rounded border border-[var(--line)]" style={{ background: "repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 16px 16px" }} />
                <div className="mt-1"><a href={gifUrl} download="emoticon.gif" className="text-xs text-[var(--accent)] hover:underline">⬇ GIF 다운로드</a></div>
              </div>
            ) : <p className="text-xs text-[var(--ink-faint)]">GIF를 만들면 여기에 미리보기가 나옵니다 (체커=투명).</p>}
          </section>
        </div>
      )}

      {err && <p className="text-sm text-[var(--accent)] mt-4">{err}</p>}
    </div>
  );
}
