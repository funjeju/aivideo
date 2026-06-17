"use client";

import { useRef, useState } from "react";
import { StylePackId, AspectRatio } from "@/lib/types";

const STYLES: { id: StylePackId; name: string }[] = [
  { id: "flat-icon", name: "플랫 아이콘" },
  { id: "whiteboard", name: "화이트보드" },
  { id: "doodle-edu", name: "낙서 교육" },
  { id: "retro-poster", name: "레트로 포스터" },
  { id: "comic-essay", name: "만화책" },
  { id: "newspaper-cartoon", name: "신문 만평" },
  { id: "collage", name: "콜라주" },
  { id: "3d-iso", name: "3D 아이소메트릭" },
  { id: "dark-neon", name: "다크 네온" },
  { id: "ink-wash", name: "수묵담채" },
  { id: "joseon-reaper", name: "조선 저승사자" },
  { id: "minhwa", name: "민화/조선" },
  { id: "drone-light", name: "드론 라이트쇼" },
];
const ASPECTS: AspectRatio[] = ["9:16", "16:9", "1:1"];

interface Result {
  image: string; prompt: string; quality: string; usedLogo: boolean; usedPhoto?: boolean;
  tokens?: { imageInput: number; textInput: number; output: number };
  costUsd?: number; costKrw?: number;
}

export default function CorporateTestPage() {
  const [companyKo, setCompanyKo] = useState("");
  const [companyEn, setCompanyEn] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [subject, setSubject] = useState("");
  const [stylePackId, setStylePackId] = useState<StylePackId>("flat-icon");
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [quality, setQuality] = useState<"low" | "medium" | "high">("high");
  const [useLogoRef, setUseLogoRef] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  function onLogo(f: File | null) {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setLogoDataUrl(r.result as string);
    r.readAsDataURL(f);
  }
  function onPhoto(f: File | null) {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setPhotoDataUrl(r.result as string);
    r.readAsDataURL(f);
  }

  async function generate() {
    if (!subject.trim() && !photoDataUrl) { setErr("그릴 장면(한 줄)을 입력하거나 업소 사진을 올리세요"); return; }
    setErr("");
    setBusy(true);
    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      const res = await fetch("/api/admin/corporate-sample", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          subject, companyKo, companyEn, quality, aspect, stylePackId,
          logoDataUrl: useLogoRef ? logoDataUrl : "",
          useLogoRef: useLogoRef && !!logoDataUrl,
          photoDataUrl,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "생성 실패"); return; }
      setResult(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--ink)] mb-2">업체용 테스트</h1>
      <p className="text-sm text-[var(--ink-soft)] mb-6">
        영상 만들기 전에, <b>사명·로고가 이미지에 제대로 나오는지</b> 미리 검증합니다. 사명은 프롬프트에 정확 표기를 지시하고,
        로고는 reference(edit)로 반영을 시도합니다. (장당 ~$0.19 high 기준)
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
        {/* 입력 */}
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-[var(--ink)]">회사명 (국문)</label>
              <input value={companyKo} onChange={(e) => setCompanyKo(e.target.value)} placeholder="예: 주식회사 아무개"
                className="w-full mt-1 px-3 py-2 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--ink)]">회사명 (영문)</label>
              <input value={companyEn} onChange={(e) => setCompanyEn(e.target.value)} placeholder="e.g. AMUGAE Inc."
                className="w-full mt-1 px-3 py-2 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--ink)]">로고 업로드</label>
            <div onClick={() => logoRef.current?.click()}
              className="mt-1 border-2 border-dashed border-[var(--line)] rounded-[var(--radius)] p-4 text-center cursor-pointer hover:border-[var(--accent)]">
              {logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoDataUrl} alt="logo" className="max-h-20 mx-auto" />
              ) : (
                <p className="text-sm text-[var(--ink-soft)]">로고 이미지 클릭 업로드 (PNG 권장)</p>
              )}
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0] ?? null)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--ink)] mt-2 cursor-pointer">
              <input type="checkbox" checked={useLogoRef} onChange={(e) => setUseLogoRef(e.target.checked)} className="accent-[var(--accent)]" />
              로고를 이미지에 반영 시도 (reference/edit)
            </label>
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--ink)]">업소 사진 → 화풍 변환 (선택)</label>
            <div onClick={() => photoRef.current?.click()}
              className="mt-1 border-2 border-dashed border-[var(--line)] rounded-[var(--radius)] p-4 text-center cursor-pointer hover:border-[var(--accent)]">
              {photoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoDataUrl} alt="photo" className="max-h-40 mx-auto rounded" />
              ) : (
                <p className="text-sm text-[var(--ink-soft)]">매장·메뉴·제품 사진 클릭 업로드 → 선택한 화풍으로 변환</p>
              )}
              <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0] ?? null)} />
            </div>
            {photoDataUrl && (
              <button type="button" onClick={() => setPhotoDataUrl("")} className="text-xs text-[var(--accent)] mt-1">사진 제거</button>
            )}
            <p className="text-xs text-[var(--ink-faint)] mt-1">사진을 올리면 아래 ‘장면’ 대신 이 사진을 화풍으로 변환합니다(구도 유지).</p>
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--ink)]">그릴 장면 / 원고 한 줄 {photoDataUrl && <span className="text-[var(--ink-faint)]">(사진 사용 중 — 비워도 됨)</span>}</label>
            <textarea value={subject} onChange={(e) => setSubject(e.target.value)} rows={3}
              placeholder="예: 회사 건물 앞에서 직원들이 활짝 웃으며 손님을 맞이하는 장면, 입구에 회사 간판"
              className="w-full mt-1 px-3 py-2 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm" />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-[var(--ink)]">화풍</label>
            <select value={stylePackId} onChange={(e) => setStylePackId(e.target.value as StylePackId)}
              className="px-2 py-1 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm">
              {STYLES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <label className="text-sm text-[var(--ink)] ml-2">비율</label>
            <select value={aspect} onChange={(e) => setAspect(e.target.value as AspectRatio)}
              className="px-2 py-1 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm">
              {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <label className="text-sm text-[var(--ink)] ml-2">화질</label>
            <select value={quality} onChange={(e) => setQuality(e.target.value as "low" | "medium" | "high")}
              className="px-2 py-1 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm">
              <option value="low">low (~$0.02)</option>
              <option value="medium">medium (~$0.06)</option>
              <option value="high">high (~$0.19)</option>
            </select>
          </div>

          <button onClick={generate} disabled={busy}
            className="self-start px-5 py-2.5 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50">
            {busy ? "생성 중..." : "샘플 생성"}
          </button>
          {err && <p className="text-sm text-[var(--accent)]">{err}</p>}
        </div>

        {/* 결과 */}
        <div>
          {result ? (
            <div className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.image} alt="결과" className="w-full rounded border border-[var(--line)]" />
              <p className="text-xs text-[var(--ink-soft)]">화질 {result.quality} · 로고 {result.usedLogo ? "반영" : "안함"} · 사진변환 {result.usedPhoto ? "예" : "아니오"}</p>
              {result.costUsd != null && (
                <div className="text-xs bg-[var(--paper-sunken)] rounded p-2 leading-relaxed">
                  <b>실측 원가: ${result.costUsd} (≈₩{result.costKrw})</b>
                  {result.tokens && (
                    <span className="text-[var(--ink-faint)]"> · 토큰 입력(이미지 {result.tokens.imageInput}/텍스트 {result.tokens.textInput}) 출력 {result.tokens.output}</span>
                  )}
                </div>
              )}
              <details className="text-xs text-[var(--ink-faint)]">
                <summary className="cursor-pointer">AI에 보낸 프롬프트 보기 (사명/로고 지시 확인)</summary>
                <p className="mt-1 whitespace-pre-wrap border border-[var(--line)] rounded p-2">{result.prompt}</p>
              </details>
            </div>
          ) : (
            <div className="aspect-[3/4] rounded border border-dashed border-[var(--line)] flex items-center justify-center text-sm text-[var(--ink-faint)]">
              생성 결과가 여기에 표시됩니다
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
