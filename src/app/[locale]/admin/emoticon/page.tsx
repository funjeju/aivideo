"use client";

// 이모티콘 테스트 (독립 페이지 — 다른 시스템 무영향).
// gpt-image-2(low)로 "스프라이트 시트" 1장을 생성해 프레임 일관성을 확인하는 실험 환경.
// 참조 캐릭터(선택) + 동작 + 프레임 수 → 한 장에 여러 포즈. (슬라이스/누끼/GIF는 다음 단계)

import { useRef, useState } from "react";

export default function EmoticonTestPage() {
  const [character, setCharacter] = useState("");
  const [action, setAction] = useState("손을 흔드는 동작 (wave hand)");
  const [frames, setFrames] = useState(4);
  const [refDataUrl, setRefDataUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ image: string; costKrw: number; costUsd: number; frames: number; grid: string } | null>(null);
  const [err, setErr] = useState("");
  // GIF 합성
  const [useCutout, setUseCutout] = useState(true);
  const [delayMs, setDelayMs] = useState(250);
  const [making, setMaking] = useState(false);
  const [gifUrl, setGifUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function loadImg(src: string): Promise<HTMLImageElement> {
    return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = rej; im.src = src; });
  }

  // 시트 → 슬라이스 → (누끼) → GIF 루프. 전부 브라우저, 비용 0.
  async function makeGif() {
    if (!result || making) return;
    setMaking(true); setErr(""); setGifUrl("");
    try {
      const cols = result.frames === 4 ? 2 : 3;
      const rows = result.frames === 9 ? 3 : 2;
      const sheet = await loadImg(result.image);
      const cw = sheet.width / cols, ch = sheet.height / rows;
      const T = 320; // 프레임 출력 크기
      const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
      const gif = GIFEncoder();
      const remove = useCutout ? (await import("@imgly/background-removal")).removeBackground : null;

      for (let i = 0; i < result.frames; i++) {
        const sx = (i % cols) * cw, sy = Math.floor(i / cols) * ch;
        const cell = document.createElement("canvas"); cell.width = T; cell.height = T;
        const cctx = cell.getContext("2d")!;
        if (!remove) { cctx.fillStyle = "#fff"; cctx.fillRect(0, 0, T, T); }
        cctx.drawImage(sheet, sx, sy, cw, ch, 0, 0, T, T);

        let frameCv = cell;
        if (remove) {
          const blob = await remove(cell.toDataURL("image/png"));
          const cut = await loadImg(URL.createObjectURL(blob));
          const fc = document.createElement("canvas"); fc.width = T; fc.height = T;
          fc.getContext("2d")!.drawImage(cut, 0, 0, T, T);
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

  function onRef(f: File | null) {
    if (!f) { setRefDataUrl(""); return; }
    const r = new FileReader();
    r.onload = () => setRefDataUrl(r.result as string);
    r.readAsDataURL(f);
  }

  async function generate() {
    if (loading) return;
    setLoading(true); setErr(""); setResult(null); setGifUrl("");
    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      const res = await fetch("/api/admin/emoticon-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ character, action, frames, refDataUrl: refDataUrl || undefined }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "생성 실패"); return; }
      setResult(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--ink)] mb-1">이모티콘 테스트 (스프라이트 시트)</h1>
      <p className="text-sm text-[var(--ink-soft)] mb-6">
        한 캐릭터의 동작 프레임을 <b>한 장(스프라이트 시트)</b>에 생성합니다 — 같은 이미지라 프레임 간 일관성이 보장돼요.
        gpt-image-2 <b>low 화질</b>(장당 저렴). 슬라이스·누끼·GIF는 다음 단계.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="flex flex-col gap-4">
          <div onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-[var(--line)] rounded-[var(--radius)] p-4 text-center cursor-pointer hover:border-[var(--accent)]">
            {refDataUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={refDataUrl} alt="ref" className="max-h-28 mx-auto rounded" />
              : <span className="text-sm text-[var(--ink-soft)]">참조 캐릭터 이미지 업로드 (선택 — 있으면 일관성↑)</span>}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onRef(e.target.files?.[0] ?? null)} />
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--ink)]">캐릭터 묘사</label>
            <textarea value={character} onChange={(e) => setCharacter(e.target.value)} rows={2}
              placeholder="예: 둥근 얼굴의 노란 병아리 캐릭터, 큰 눈, 주황 부리"
              className="w-full mt-1 p-2 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm text-[var(--ink)]" />
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--ink)]">동작</label>
            <input value={action} onChange={(e) => setAction(e.target.value)}
              className="w-full mt-1 p-2 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm text-[var(--ink)]" />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--ink)]">프레임 수</label>
            <select value={frames} onChange={(e) => setFrames(Number(e.target.value))}
              className="px-2 py-1 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm">
              <option value={4}>4 (2x2)</option>
              <option value={6}>6 (2x3)</option>
              <option value={9}>9 (3x3)</option>
            </select>
          </div>

          <button onClick={generate} disabled={loading}
            className="px-5 py-2.5 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50">
            {loading ? "생성 중… (수십 초)" : "스프라이트 시트 생성"}
          </button>
          {err && <p className="text-sm text-[var(--accent)]">{err}</p>}
        </div>

        <div>
          {result ? (
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.image} alt="sprite sheet" className="w-full rounded-[var(--radius)] border border-[var(--line)]" />
              <p className="text-xs text-[var(--ink-soft)] mt-2">
                {result.frames}프레임 ({result.grid}) · 원가 ${result.costUsd} (≈₩{result.costKrw})
              </p>
              <p className="text-[11px] text-[var(--ink-faint)] mt-1">
                일관성 확인 포인트: 모든 칸의 캐릭터가 같은 얼굴·옷·색인지, 동작만 자연스럽게 바뀌는지.
              </p>

              {/* 슬라이스 → 누끼 → GIF 루프 (전부 브라우저, 비용 0) */}
              <div className="mt-4 border-t border-[var(--line)] pt-4">
                <p className="text-sm font-semibold text-[var(--ink)] mb-2">움직이는 이모티콘 만들기 (GIF)</p>
                <div className="flex items-center gap-4 flex-wrap mb-2">
                  <label className="flex items-center gap-2 text-sm text-[var(--ink)] cursor-pointer">
                    <input type="checkbox" checked={useCutout} onChange={(e) => setUseCutout(e.target.checked)} className="accent-[var(--accent)]" />
                    누끼(투명배경)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
                    프레임 속도
                    <input type="range" min={80} max={500} step={10} value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value))} className="accent-[var(--accent)]" />
                    <span className="text-xs tabular-nums w-12">{delayMs}ms</span>
                  </label>
                  <button onClick={makeGif} disabled={making}
                    className="px-4 py-2 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50">
                    {making ? "만드는 중…" : "GIF 만들기"}
                  </button>
                </div>
                {gifUrl && (
                  <div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={gifUrl} alt="emoticon gif" className="h-40 rounded border border-[var(--line)]"
                      style={{ background: "repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 16px 16px" }} />
                    <div className="mt-1">
                      <a href={gifUrl} download="emoticon.gif" className="text-xs text-[var(--accent)] hover:underline">⬇ GIF 다운로드</a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="aspect-square rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper-sunken)] flex items-center justify-center text-[var(--ink-faint)] text-sm">
              생성하면 여기에 스프라이트 시트가 나옵니다
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
