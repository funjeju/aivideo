"use client";

import { useRef, useState } from "react";
import { SceneSpec, RevealObject, StylePackId, BrushType } from "@/lib/types";
import BrushPlayer from "./BrushPlayer";

const BRUSH_TYPES: { id: BrushType; name: string; desc: string }[] = [
  { id: "round",   name: "둥근 붓",     desc: "부드럽고 일반적인 붓" },
  { id: "dry",     name: "드라이브러시", desc: "군데군데 끊기는 거친 질감" },
  { id: "flat",    name: "평붓",         desc: "넓고 납작한 터치" },
  { id: "bristle", name: "강모붓",       desc: "여러 가닥이 갈라지는 붓" },
  { id: "ink",     name: "먹/캘리",      desc: "속도따라 굵기가 극적으로 변화" },
];

const STYLES: { id: StylePackId; name: string }[] = [
  { id: "whiteboard", name: "화이트보드" },
  { id: "ink-wash", name: "수묵담채" },
  { id: "minhwa", name: "민화" },
  { id: "doodle-edu", name: "낙서 교육" },
];

export default function BrushTestPage() {
  const [imageBase64, setImageBase64] = useState<string>("");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [narration, setNarration] = useState("");
  const [stylePackId, setStylePackId] = useState<StylePackId>("ink-wash");
  const [brushType, setBrushType] = useState<BrushType>("round");
  const [brushSize, setBrushSize] = useState(1);
  const [brushCount, setBrushCount] = useState(1);
  const [brushSpeed, setBrushSpeed] = useState(1);
  const [showBrush, setShowBrush] = useState(true);
  const [scene, setScene] = useState<SceneSpec | null>(null);
  const [objects, setObjects] = useState<RevealObject[]>([]);
  const [playing, setPlaying] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(f: File | null) {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImageBase64(dataUrl);
      const img = new Image();
      img.onload = () => setImage(img);
      img.src = dataUrl;
      // 이미지 바꾸면 분석 결과 초기화
      setScene(null);
      setObjects([]);
      setAudioUrl("");
      setPlaying(false);
    };
    reader.readAsDataURL(f);
  }

  async function analyze() {
    if (!imageBase64) { setError("이미지를 업로드하세요"); return; }
    setError("");
    setAnalyzing(true);
    setPlaying(false);
    // 이전 blob URL 해제
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl("");

    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();

      // 이미지 분석 + TTS 병렬
      const [brushRes, ttsRes] = await Promise.all([
        fetch("/api/admin/brush-test", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ imageBase64, narration, stylePackId, brushSize }),
        }),
        narration.trim()
          ? fetch("/api/admin/tts-preview", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ narration }),
            })
          : null,
      ]);

      const data = await brushRes.json();
      if (!brushRes.ok) { setError(data.error ?? "분석 실패"); return; }
      setScene({ ...data.sceneSpec, image: { url: "local", fit: "contain" } });
      setObjects(data.objects ?? []);

      if (ttsRes?.ok) {
        const blob = await ttsRes.blob();
        setAudioUrl(URL.createObjectURL(blob));
      }
      // 분석 완료 후 자동 재생 안 함 — 재생 버튼을 따로 눌러서 시작
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--ink)] mb-2">붓 테스트</h1>
      <p className="text-sm text-[var(--ink-soft)] mb-6">
        이미지를 올리고 나레이션을 입력하면, AI가 의미를 분석(OCR/Vision)해 그 순서대로 붓이 그려나가는 걸 미리 봅니다.
        영상 생성 없이 이미지 1장으로 즉시 테스트합니다.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 좌: 입력 */}
        <div className="flex flex-col gap-4">
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-[var(--line)] rounded-[var(--radius)] p-6 text-center cursor-pointer hover:border-[var(--accent)]"
          >
            {imageBase64 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageBase64} alt="업로드" className="max-h-48 mx-auto rounded" />
            ) : (
              <p className="text-sm text-[var(--ink-soft)]">이미지 클릭/드롭하여 업로드</p>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--ink)]">나레이션 (의미 매칭용)</label>
            <textarea
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              rows={3}
              placeholder="예: 사과를 하나 먹으면 만족스럽지만, 두 번째는 덜하죠."
              className="w-full mt-1 p-2 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm text-[var(--ink)]"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--ink)]">화풍</label>
            <select value={stylePackId} onChange={(e) => setStylePackId(e.target.value as StylePackId)}
              className="px-2 py-1 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm">
              {STYLES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--ink)]">붓 종류</label>
            <div className="grid grid-cols-5 gap-1 mt-1">
              {BRUSH_TYPES.map((b) => (
                <button
                  key={b.id}
                  title={b.desc}
                  onClick={() => setBrushType(b.id)}
                  className={`px-2 py-1.5 rounded text-xs border transition-colors ${
                    brushType === b.id
                      ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                      : "border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)]"
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--ink)] w-16">붓 크기</label>
            <input type="range" min={0.3} max={6} step={0.1} value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="flex-1 accent-[var(--accent)]" />
            <span className="text-sm tabular-nums w-10 text-right">{brushSize.toFixed(1)}×</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--ink)] w-16">붓 개수</label>
            <input type="range" min={1} max={6} step={1} value={brushCount}
              onChange={(e) => setBrushCount(Number(e.target.value))}
              className="flex-1 accent-[var(--accent)]" />
            <span className="text-sm tabular-nums w-10 text-right">{brushCount}개</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--ink)] w-16">붓 속도</label>
            <input type="range" min={0.05} max={4} step={0.05} value={brushSpeed}
              onChange={(e) => setBrushSpeed(Number(e.target.value))}
              className="flex-1 accent-[var(--accent)]" />
            <span className="text-sm tabular-nums w-10 text-right">{brushSpeed.toFixed(1)}×</span>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--ink)] cursor-pointer">
            <input type="checkbox" checked={showBrush} onChange={(e) => setShowBrush(e.target.checked)}
              className="accent-[var(--accent)]" />
            붓 표시
          </label>

          <div className="flex gap-2 flex-wrap">
            {/* 분석: 이미지+나레이션 바뀌었을 때만 다시 누름 */}
            <button onClick={analyze} disabled={analyzing}
              className="px-5 py-2.5 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50">
              {analyzing ? "분석 중..." : "분석"}
            </button>

            {/* 재생/정지: 분석 결과 있을 때만 활성 */}
            {scene && (
              <button
                onClick={() => setPlaying((p) => !p)}
                className="px-5 py-2.5 rounded-[var(--radius)] border border-[var(--line)] text-sm font-medium"
              >
                {playing ? "⏸ 정지" : "▶ 재생"}
              </button>
            )}
          </div>
          {error && <p className="text-sm text-[var(--accent)]">{error}</p>}

          {scene && (
            <p className="text-xs text-[var(--ink-soft)]">
              {audioUrl ? "🔊 나레이션 음성 준비됨 — 재생 시 음성과 붓이 함께 나옵니다" : "나레이션 없음 — 경과 시간 기반으로 재생됩니다"}
            </p>
          )}

          {objects.length > 0 && (
            <div className="text-xs text-[var(--ink-soft)] border border-[var(--line)] rounded p-3">
              <p className="font-medium mb-1 text-[var(--ink)]">분석 결과 (그리는 순서)</p>
              {objects
                .slice()
                .sort((a, b) => (a.revealOrder ?? 99) - (b.revealOrder ?? 99))
                .map((o) => (
                  <div key={o.id}>
                    {o.revealOrder}. [{o.role}] {o.anchorText ? `"${o.anchorText}"` : "(앵커 없음)"}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* 우: 미리보기 */}
        <div>
          <BrushPlayer
            scene={scene}
            image={image}
            playing={playing}
            brushSize={brushSize}
            brushCount={brushCount}
            brushSpeed={brushSpeed}
            showBrush={showBrush}
            audioUrl={audioUrl}
            brushType={brushType}
          />
        </div>
      </div>
    </div>
  );
}
