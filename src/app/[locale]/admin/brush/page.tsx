"use client";

import { useRef, useState, useMemo, useEffect } from "react";
import { SceneSpec, RevealObject, StylePackId, BrushType, AspectRatio } from "@/lib/types";
import BrushPlayer, { BrushPlayerHandle } from "./BrushPlayer";

const ASPECTS: { value: AspectRatio; label: string }[] = [
  { value: "9:16", label: "세로 9:16" },
  { value: "16:9", label: "가로 16:9" },
  { value: "1:1", label: "정사각 1:1" },
];

const HAND_TOOLS: { id: string; name: string; desc: string }[] = [
  { id: "brush",      name: "붓",     desc: "붓 단독" },
  { id: "marker",     name: "마커",   desc: "마커 단독" },
  { id: "pen",        name: "펜",     desc: "파란 펜 단독" },
  { id: "hand-pen",   name: "손+펜",  desc: "손이 펜을 쥐고 그림" },
  { id: "hand-brush", name: "손+붓",  desc: "손이 붓을 쥐고 그림" },
];

const BRUSH_TYPES: { id: BrushType; name: string; desc: string }[] = [
  { id: "round",      name: "둥근 붓",     desc: "부드럽고 일반적인 붓" },
  { id: "dry",        name: "드라이브러시", desc: "군데군데 끊기는 거친 질감" },
  { id: "flat",       name: "평붓",         desc: "넓고 납작한 터치" },
  { id: "bristle",    name: "강모붓",       desc: "여러 가닥이 갈라지는 붓" },
  { id: "ink",        name: "먹/캘리",      desc: "속도따라 굵기가 극적으로 변화" },
  { id: "pencil",     name: "연필",         desc: "가는 심 + 미세 떨림, 가볍고 건조" },
  { id: "charcoal",   name: "목탄",         desc: "본선 주변 분진 입자, 거친 스케치" },
  { id: "watercolor", name: "수채",         desc: "넓고 투명한 번짐, 물 고임" },
  { id: "crayon",     name: "크레용",       desc: "왁스 질감, 군데군데 안 발림" },
];

const STYLES: { id: StylePackId; name: string }[] = [
  { id: "whiteboard", name: "화이트보드" },
  { id: "ink-wash", name: "수묵담채" },
  { id: "joseon-reaper", name: "조선 저승사자" },
  { id: "minhwa", name: "민화" },
  { id: "doodle-edu", name: "낙서 교육" },
];

export default function BrushTestPage() {
  const [imageBase64, setImageBase64] = useState<string>("");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [narration, setNarration] = useState("");
  const [stylePackId, setStylePackId] = useState<StylePackId>("ink-wash");
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [brushType, setBrushType] = useState<BrushType>("round");
  const [handAsset, setHandAsset] = useState("brush");
  const [brushSize, setBrushSize] = useState(1);
  const [brushCount, setBrushCount] = useState(1);
  const [brushSpeed, setBrushSpeed] = useState(1);
  const [inkSpread, setInkSpread] = useState(0.5); // 번짐(fill blur): 0 또렷 ~ 1 번짐
  const [fillRange, setFillRange] = useState(1);   // 채움 범위: 0.1 좁게(객체만) ~ 1 넓게(영역 전체)
  const [showBrush, setShowBrush] = useState(true);
  const [showBoxes, setShowBoxes] = useState(false);
  const [flowMode, setFlowMode] = useState<"sync" | "topdown">("sync");
  const [scene, setScene] = useState<SceneSpec | null>(null);
  const [objects, setObjects] = useState<RevealObject[]>([]);
  const [playing, setPlaying] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  // 스타일팩별 샘플 이미지 생성
  const [sampleSubject, setSampleSubject] = useState("");
  const [samples, setSamples] = useState<Record<string, { loading: boolean; image?: string; error?: string }>>({});
  const [genningAll, setGenningAll] = useState(false);
  const [sampleHiQ, setSampleHiQ] = useState(false); // 샘플 화질: 기본 low(저렴), 켜면 medium
  const fileRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<BrushPlayerHandle>(null);

  // 화풍(프리셋) 바뀌면 그 프리셋에 저장된 붓 게이지를 불러와 슬라이더에 반영
  useEffect(() => {
    (async () => {
      try {
        const { getIdToken } = await import("@/lib/clientAuth");
        const token = await getIdToken();
        const res = await fetch(`/api/admin/settings?stylePackId=${stylePackId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const d = await res.json();
        setBrushSize(d.brushSize ?? 1);
        setBrushCount(d.brushCount ?? 1);
        setBrushSpeed(d.brushSpeed ?? 1);
        setBrushType((d.brushType as BrushType) ?? "round");
        setHandAsset(d.handAsset || "brush");
        setFlowMode(d.flowMode === "topdown" ? "topdown" : "sync");
        setInkSpread(typeof d.inkSpread === "number" ? d.inkSpread : 0.5);
        setFillRange(typeof d.fillRange === "number" ? d.fillRange : 1);
      } catch {
        // 무시 — 기본값 유지
      }
    })();
  }, [stylePackId]);

  async function saveAsDefaults() {
    if (saving) return;
    setSaving(true);
    setSavedMsg("");
    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        // 현재 선택한 화풍(프리셋)에만 저장
        body: JSON.stringify({ stylePackId, brushSize, brushCount, brushSpeed, brushType, handAsset, flowMode, inkSpread, fillRange }),
      });
      const packName = STYLES.find((s) => s.id === stylePackId)?.name ?? stylePackId;
      setSavedMsg(res.ok ? `✓ "${packName}" 화풍 기본값 저장됨 — 이 화풍 영상에 적용` : "저장 실패 (superadmin 권한 필요)");
    } catch {
      setSavedMsg("저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function generateSample(packId: StylePackId) {
    if (!sampleSubject.trim()) { setError("샘플 주제(한 줄)를 입력하세요"); return; }
    setError("");
    setSamples((s) => ({ ...s, [packId]: { loading: true } }));
    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      const res = await fetch("/api/admin/sample-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stylePackId: packId, subject: sampleSubject, quality: sampleHiQ ? "medium" : "low", aspect }),
      });
      const data = await res.json();
      if (!res.ok) { setSamples((s) => ({ ...s, [packId]: { loading: false, error: data.error ?? "실패" } })); return; }
      setSamples((s) => ({ ...s, [packId]: { loading: false, image: data.image } }));
    } catch {
      setSamples((s) => ({ ...s, [packId]: { loading: false, error: "오류" } }));
    }
  }

  async function generateAllSamples() {
    if (!sampleSubject.trim()) { setError("샘플 주제(한 줄)를 입력하세요"); return; }
    setGenningAll(true);
    try {
      await Promise.all(STYLES.map((s) => generateSample(s.id)));
    } finally {
      setGenningAll(false);
    }
  }

  // 생성된 샘플을 붓 테스트 캔버스로 불러오기
  function loadSampleForTest(packId: StylePackId, dataUrl: string) {
    setImageBase64(dataUrl);
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = dataUrl;
    setStylePackId(packId);
    setScene(null);
    setObjects([]);
    setAudioUrl("");
    setPlaying(false);
  }

  async function downloadRecording() {
    if (!scene || recording) return;
    setRecording(true);
    try {
      setPlaying(true); // 재생 상태에서 캔버스가 갱신돼야 captureStream에 프레임이 들어옴
      await new Promise((r) => setTimeout(r, 120));
      await playerRef.current?.record();
    } finally {
      setRecording(false);
    }
  }

  // 위→아래 모드: 나레이션 anchor 무시, 객체를 화면 상단부터 순서대로 완성하며 내려감.
  // startAt 제거 → 렌더러가 균등 슬롯 폴백 사용 (전체 시간은 durationSec = 나레이션 길이 유지)
  const playScene = useMemo<SceneSpec | null>(() => {
    if (!scene) return null;
    if (flowMode !== "topdown") return scene;
    const objs = (scene.reveal?.objects ?? [])
      .slice()
      .sort((a, b) => (a.bbox[1] - b.bbox[1]) || (a.bbox[0] - b.bbox[0]))
      .map((o, i) => ({ ...o, revealOrder: i + 1, startAt: undefined, endAt: undefined }));
    return { ...scene, reveal: { objects: objs } };
  }, [scene, flowMode]);

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
          body: JSON.stringify({ imageBase64, narration, stylePackId, brushSize, aspect, inkSpread, fillRange }),
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

      let sceneSpec = { ...data.sceneSpec, image: { url: "local", fit: "contain" } };

      if (ttsRes?.ok) {
        const blob = await ttsRes.blob();
        const blobUrl = URL.createObjectURL(blob);
        setAudioUrl(blobUrl);

        // TTS 실제 길이를 측정해 sceneSpec.durationSec를 업데이트.
        // 그러면 planner의 startAt/endAt이 실제 나레이션 시간에 맞게 재계산됨.
        const ttsDuration = await new Promise<number>((resolve) => {
          const a = new Audio(blobUrl);
          a.onloadedmetadata = () => resolve(a.duration);
          a.onerror = () => resolve(data.durationSec ?? 6);
        });

        if (ttsDuration > 0) {
          // brush-test API를 durationSec 포함해 재호출 → planner가 실제 시간으로 재계산
          const { getIdToken: gid } = await import("@/lib/clientAuth");
          const tok = await gid();
          const reRes = await fetch("/api/admin/brush-test", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
            body: JSON.stringify({ imageBase64, narration, stylePackId, brushSize, durationSec: ttsDuration, aspect, inkSpread, fillRange }),
          });
          if (reRes.ok) {
            const reData = await reRes.json();
            sceneSpec = { ...reData.sceneSpec, image: { url: "local", fit: "contain" } };
            setObjects(reData.objects ?? []);
          }
        }
      } else {
        setObjects(data.objects ?? []);
      }

      setScene(sceneSpec);
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

      {/* 스타일팩별 샘플 이미지 생성 */}
      <div className="mb-8 border border-[var(--line)] rounded-[var(--radius)] p-4 bg-[var(--paper-sunken)]">
        <p className="text-sm font-semibold text-[var(--ink)] mb-1">스타일팩별 샘플 이미지 생성</p>
        <p className="text-xs text-[var(--ink-soft)] mb-3">
          한 줄 주제로 각 화풍의 샘플 이미지를 생성해 비교합니다. 마음에 드는 걸 “이 이미지로 붓 테스트”로 불러와 드로잉을 확인하세요.
          비교용이라 기본은 <b>저화질(~$0.02/장)</b> — 화풍만 보면 충분합니다. 비용 절약 위해 <b>원하는 화풍 칸을 눌러 한 개씩 생성</b>하세요. (전체 생성은 화풍 수만큼 비용)
        </p>
        <div className="flex gap-2 mb-2">
          <input
            value={sampleSubject}
            onChange={(e) => setSampleSubject(e.target.value)}
            placeholder="예: 한계효용 — 사과를 베어무는 사람과 줄어드는 만족"
            className="flex-1 px-3 py-2 rounded border border-[var(--line)] bg-[var(--paper)] text-sm text-[var(--ink)]"
          />
          <button
            onClick={generateAllSamples}
            disabled={genningAll}
            title="모든 화풍을 한 번에 생성 (화풍 수만큼 비용)"
            className="px-4 py-2 rounded-[var(--radius)] border border-[var(--line)] text-[var(--ink)] text-sm font-medium disabled:opacity-50 whitespace-nowrap hover:bg-[var(--paper)]"
          >
            {genningAll ? "생성 중..." : `전체 생성 (${STYLES.length}장)`}
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--ink-soft)] mb-3 cursor-pointer">
          <input type="checkbox" checked={sampleHiQ} onChange={(e) => setSampleHiQ(e.target.checked)} className="accent-[var(--accent)]" />
          고화질로 생성 (medium, ~$0.06/장) — 끄면 저화질 ~$0.02/장
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {STYLES.map((s) => {
            const r = samples[s.id];
            return (
              <div key={s.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--ink)]">{s.name}</span>
                  <button
                    onClick={() => generateSample(s.id)}
                    disabled={r?.loading}
                    title="이 화풍만 생성/재생성"
                    className="text-[11px] text-[var(--ink-faint)] hover:text-[var(--accent)] disabled:opacity-50"
                  >
                    ↻
                  </button>
                </div>
                <div className="aspect-[2/3] rounded overflow-hidden bg-[var(--paper)] border border-[var(--line)] flex items-center justify-center">
                  {r?.loading ? (
                    <span className="text-xs text-[var(--ink-faint)]">생성 중…</span>
                  ) : r?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image} alt={s.name} className="w-full h-full object-cover" />
                  ) : (
                    // 빈 칸 = 이 화풍만 생성하는 버튼 (개별 생성)
                    <button
                      onClick={() => generateSample(s.id)}
                      className="w-full h-full flex flex-col items-center justify-center gap-1 text-[var(--ink-faint)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
                    >
                      <span className="text-xl leading-none">＋</span>
                      <span className="text-xs">{r?.error ? "다시 생성" : "생성"}</span>
                      {r?.error && <span className="text-[10px] text-[var(--accent)] px-1 text-center">{r.error}</span>}
                    </button>
                  )}
                </div>
                {r?.image && (
                  <button
                    onClick={() => loadSampleForTest(s.id, r.image!)}
                    className="text-[11px] px-2 py-1 rounded border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--paper)]"
                  >
                    이 이미지로 붓 테스트
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

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

          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-[var(--ink)]">화풍</label>
            <select value={stylePackId} onChange={(e) => setStylePackId(e.target.value as StylePackId)}
              className="px-2 py-1 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm">
              {STYLES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <label className="text-sm text-[var(--ink)] ml-2">화면 비율</label>
            <select value={aspect} onChange={(e) => setAspect(e.target.value as AspectRatio)}
              className="px-2 py-1 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm">
              {ASPECTS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--ink)]">그리기 흐름</label>
            <div className="grid grid-cols-2 gap-1 mt-1">
              <button
                onClick={() => setFlowMode("sync")}
                title="나레이션 구절이 발화되는 시점에 해당 요소를 그림"
                className={`px-2 py-1.5 rounded text-xs border transition-colors ${
                  flowMode === "sync"
                    ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                    : "border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)]"
                }`}
              >
                나레이션 동기
              </button>
              <button
                onClick={() => setFlowMode("topdown")}
                title="화면 위에서부터 차례로 완성하며 내려감 (전체 시간은 나레이션 길이)"
                className={`px-2 py-1.5 rounded text-xs border transition-colors ${
                  flowMode === "topdown"
                    ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                    : "border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)]"
                }`}
              >
                위→아래
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--ink)]">도구 모양</label>
            <div className="grid grid-cols-5 gap-1 mt-1">
              {HAND_TOOLS.map((t2) => (
                <button
                  key={t2.id}
                  title={t2.desc}
                  onClick={() => setHandAsset(t2.id)}
                  className={`px-2 py-1.5 rounded text-xs border transition-colors ${
                    handAsset === t2.id
                      ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                      : "border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)]"
                  }`}
                >
                  {t2.name}
                </button>
              ))}
            </div>
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
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--ink)] w-16" title="채움 번짐 정도 — 작으면 또렷(화이트보드), 크면 잉크처럼 번짐(수묵)">번짐</label>
            <input type="range" min={0} max={1} step={0.05} value={inkSpread}
              onChange={(e) => setInkSpread(Number(e.target.value))}
              className="flex-1 accent-[var(--accent)]" />
            <span className="text-sm tabular-nums w-10 text-right">{Math.round(inkSpread * 100)}%</span>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-[var(--ink)] w-16" title="채움 범위 — 작으면 객체 근처만(빈 배경 안 칠함), 크면 영역 전체로 퍼짐">채움범위</label>
            <input type="range" min={0.1} max={1} step={0.05} value={fillRange}
              onChange={(e) => setFillRange(Number(e.target.value))}
              className="flex-1 accent-[var(--accent)]" />
            <span className="text-sm tabular-nums w-10 text-right">{Math.round(fillRange * 100)}%</span>
          </div>
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 text-sm text-[var(--ink)] cursor-pointer">
              <input type="checkbox" checked={showBrush} onChange={(e) => setShowBrush(e.target.checked)}
                className="accent-[var(--accent)]" />
              붓 표시
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--ink)] cursor-pointer">
              <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)}
                className="accent-[var(--accent)]" />
              bbox 디버그 (분석 박스 표시)
            </label>
          </div>

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
            {scene && (
              <button
                onClick={downloadRecording}
                disabled={recording}
                title="처음부터 재생하며 녹화해 webm(영상+나레이션)으로 저장"
                className="px-5 py-2.5 rounded-[var(--radius)] border border-[var(--line)] text-sm font-medium disabled:opacity-50"
              >
                {recording ? "녹화 중..." : "⬇ 영상 다운로드"}
              </button>
            )}
            <button
              onClick={saveAsDefaults}
              disabled={saving}
              title="현재 붓 게이지(두께/번짐/채움범위/개수/속도/종류/도구/흐름)를 이 화풍의 기본값으로 저장 — 이 화풍으로 만드는 영상에 적용"
              className="px-5 py-2.5 rounded-[var(--radius)] border border-[var(--line)] text-sm font-medium disabled:opacity-50"
            >
              {saving ? "저장 중..." : "💾 이 화풍 기본값 저장"}
            </button>
          </div>
          {savedMsg && <p className="text-sm text-[var(--ink-soft)]">{savedMsg}</p>}
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
            ref={playerRef}
            scene={playScene}
            image={image}
            playing={playing}
            brushSize={brushSize}
            brushCount={brushCount}
            brushSpeed={brushSpeed}
            inkSpread={inkSpread}
            fillRange={fillRange}
            showBrush={showBrush}
            audioUrl={audioUrl}
            brushType={brushType}
            handAsset={handAsset}
            showBoxes={showBoxes}
          />
        </div>
      </div>
    </div>
  );
}
