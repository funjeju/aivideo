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
  const fileRef = useRef<HTMLInputElement>(null);

  function onRef(f: File | null) {
    if (!f) { setRefDataUrl(""); return; }
    const r = new FileReader();
    r.onload = () => setRefDataUrl(r.result as string);
    r.readAsDataURL(f);
  }

  async function generate() {
    if (loading) return;
    setLoading(true); setErr(""); setResult(null);
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
