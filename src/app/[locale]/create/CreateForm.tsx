"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { StylePackId, TargetLength, AspectRatio } from "@/lib/types";
import { MIN_LENGTH, MAX_LENGTH, formatLength, sceneCountForLength } from "@/lib/length";

// 슬라이더 빠른선택 프리셋(틱)
const LENGTH_PRESETS = [60, 180, 600];

const STYLE_PACKS: { id: StylePackId; name: string; desc: string; emoji: string }[] = [
  { id: "whiteboard", name: "클래식 화이트보드", desc: "깔끔한 설명 영상 기본기", emoji: "✏️" },
  { id: "doodle-edu", name: "낙서 교육", desc: "마커 낙서체, 한국 교육 유튜브 스타일", emoji: "🖊️" },
  { id: "ink-wash", name: "수묵담채", desc: "한지 위 먹선, 심리·철학·역사", emoji: "🖌️" },
  { id: "joseon-reaper", name: "조선 저승사자", desc: "수묵 산수 + 갓 쓴 내레이터, 위트있는 교양", emoji: "👻" },
  { id: "flat-icon", name: "플랫 아이콘", desc: "깔끔한 플랫 컬러 아이콘, 또렷한 외곽선", emoji: "🟦" },
  { id: "retro-poster", name: "레트로 포스터", desc: "미드센추리 빈티지, 따뜻한 색·할프톤", emoji: "📻" },
  { id: "dark-neon", name: "다크 네온", desc: "어두운 배경 + 네온 글로우", emoji: "🌃" },
  { id: "3d-iso", name: "3D 아이소메트릭", desc: "3D 블록·입체감 (채움범위↑ 권장)", emoji: "🧊" },
  { id: "newspaper-cartoon", name: "신문 만평", desc: "흑백 캐리커처, 시사·풍자", emoji: "🗞️" },
  { id: "comic-essay", name: "만화책", desc: "웹툰 에세이체, 이야기로 기억", emoji: "💬" },
  { id: "collage", name: "콜라주", desc: "테리 길리엄식 오려붙임, 빈티지·풍자", emoji: "✂️" },
  { id: "minhwa", name: "민화/조선", desc: "오방색 모티프, 한국사·문화", emoji: "🐯" },
];

const ASPECTS: { value: AspectRatio; label: string; sub: string; icon: string }[] = [
  { value: "9:16", label: "세로", sub: "숏폼·릴스", icon: "▯" },
  { value: "16:9", label: "가로", sub: "유튜브", icon: "▭" },
  { value: "1:1", label: "정사각", sub: "피드", icon: "▢" },
];

// voices 컬렉션 로드 실패 시 폴백
const FALLBACK_VOICES = [
  { id: "nova", name: "따뜻한 여성" },
  { id: "shimmer", name: "차분한 여성" },
  { id: "echo", name: "낮은 남성" },
  { id: "onyx", name: "중후한 남성" },
];

export default function CreateForm() {
  const t = useTranslations("create");
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const [mode, setMode] = useState<"generate" | "faithful" | "corporate">("generate");
  const [topic, setTopic] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // 업소용(기업) 영상 — 사명/로고를 매 장면에 반영
  const [companyKo, setCompanyKo] = useState("");
  const [companyEn, setCompanyEn] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [useLogoRef, setUseLogoRef] = useState(true);
  const logoRef = useRef<HTMLInputElement>(null);
  // 업소용 입력 방식: 주제로 AI 생성 vs 원고 직접 입력
  const [corpInput, setCorpInput] = useState<"topic" | "script">("topic");
  const [scriptText, setScriptText] = useState("");
  const [targetLength, setTargetLength] = useState<TargetLength>(60);
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [stylePackId, setStylePackId] = useState<StylePackId>("whiteboard");
  const [voiceId, setVoiceId] = useState("nova");
  const [voices, setVoices] = useState<{ id: string; name: string; previewUrl?: string }[]>(FALLBACK_VOICES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // voices 컬렉션에서 노출 보이스 로드 (실패 시 폴백 유지)
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "voices"), where("enabled", "==", true)));
        if (!snap.empty) {
          const list = snap.docs
            .map((d) => d.data() as { id: string; displayName: string; sortOrder?: number; previewUrl?: string })
            .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
            .map((v) => ({ id: v.id, name: v.displayName, previewUrl: v.previewUrl }));
          setVoices(list);
          if (!list.find((v) => v.id === voiceId)) setVoiceId(list[0].id);
        }
      } catch {
        // 폴백 유지
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { setError("로그인이 필요합니다"); return; }
    if (mode === "generate" && !topic.trim()) { setError("주제를 입력해 주세요"); return; }
    if (mode === "faithful" && !file) { setError("파일을 업로드해 주세요"); return; }
    if (mode === "corporate") {
      if (corpInput === "topic" && !topic.trim()) { setError("회사 소개 핵심 메시지를 입력해 주세요"); return; }
      if (corpInput === "script" && !scriptText.trim()) { setError("원고를 입력해 주세요"); return; }
      if (!companyKo.trim() && !companyEn.trim()) { setError("회사명(국문 또는 영문)을 입력해 주세요"); return; }
    }

    // 업소용: 주제→AI 생성(generate) / 원고 직접 입력→충실 변환(faithful). 그 뒤 매 장면에 사명/로고 반영.
    const submitMode =
      mode === "corporate" ? (corpInput === "script" ? "faithful" : "generate") : mode;

    setLoading(true);
    setError("");

    try {
      // 1. 프로젝트 생성
      const formData = new FormData();
      formData.append("ownerId", user.uid);
      formData.append("mode", submitMode);
      formData.append("targetLength", String(targetLength));
      formData.append("aspect", aspect);
      formData.append("stylePackId", stylePackId);
      formData.append("voiceId", voiceId);
      formData.append("contentLocale", "ko");
      if (submitMode === "generate") formData.append("topic", topic);
      if (submitMode === "faithful" && file) formData.append("file", file);
      // 업소용 원고 직접 입력은 파일이 아니라 텍스트로 전달
      if (mode === "corporate" && corpInput === "script") formData.append("sourceText", scriptText);
      if (mode === "corporate") {
        formData.append("companyKo", companyKo);
        formData.append("companyEn", companyEn);
        formData.append("useLogoRef", String(useLogoRef));
        if (logoFile) formData.append("logo", logoFile);
      }

      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();

      const projRes = await fetch("/api/projects", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const { projectId, error: projErr } = await projRes.json();
      if (projErr) throw new Error(projErr);

      // 2. 원고 생성
      const scriptRes = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId, mode: submitMode, topic, targetLength, contentLocale: "ko" }),
      });
      const { error: scriptErr } = await scriptRes.json();
      if (scriptErr) throw new Error(scriptErr);

      router.push(`/${locale}/project/${projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
      setLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  function onLogo(f: File | null) {
    if (!f) return;
    setLogoFile(f);
    const r = new FileReader();
    r.onload = () => setLogoDataUrl(r.result as string);
    r.readAsDataURL(f);
  }

  function previewVoice(v: { id: string; previewUrl?: string }) {
    const audio = audioRef.current;
    if (!audio) return;
    // 공개 Storage URL을 직접 재생(브라우저 캐시 → 즉시). 없으면 라우트 폴백.
    // &t= 캐시버스트 제거 — 같은 URL이라야 브라우저가 캐싱해 두 번째부턴 즉각 재생.
    audio.pause();
    audio.src = v.previewUrl || `/api/voice-preview?voiceId=${v.id}`;
    audio.load();
    audio.play().catch(() => {});
  }

  return (
    <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl font-semibold text-[var(--ink)] mb-8">{t("title")}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        {/* 입력 모드 탭 */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as "generate" | "faithful" | "corporate")}>
          <TabsList className="w-full mb-4">
            <TabsTrigger value="generate" className="flex-1">{t("modeGenerate")}</TabsTrigger>
            <TabsTrigger value="faithful" className="flex-1">{t("modeFaithful")}</TabsTrigger>
            <TabsTrigger value="corporate" className="flex-1">업소용</TabsTrigger>
          </TabsList>

          <TabsContent value="generate">
            <Textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t("topicPlaceholder")}
              rows={4}
              className="resize-none bg-[var(--paper-sunken)] border-[var(--line)] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus-visible:ring-[var(--accent)]"
            />
          </TabsContent>

          <TabsContent value="corporate">
            <div className="flex flex-col gap-4">
              <p className="text-xs text-[var(--ink-soft)] -mt-1">
                회사 소개·홍보 영상. 입력한 <b>사명·로고가 매 장면 이미지에 반영</b>됩니다. (먼저 어드민 &gt; 업소용 테스트로 정확도 확인 권장)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--ink-soft)]">회사명 (국문)</label>
                  <input
                    value={companyKo}
                    onChange={(e) => setCompanyKo(e.target.value)}
                    placeholder="예: 주식회사 아무개"
                    className="w-full mt-1 px-3 py-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper-sunken)] text-sm text-[var(--ink)]"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--ink-soft)]">회사명 (영문)</label>
                  <input
                    value={companyEn}
                    onChange={(e) => setCompanyEn(e.target.value)}
                    placeholder="e.g. AMUGAE Inc."
                    className="w-full mt-1 px-3 py-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper-sunken)] text-sm text-[var(--ink)]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--ink-soft)]">로고 (선택)</label>
                <div
                  onClick={() => logoRef.current?.click()}
                  className="mt-1 border-2 border-dashed border-[var(--line)] rounded-[var(--radius)] p-3 text-center cursor-pointer hover:border-[var(--accent)]"
                >
                  {logoDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoDataUrl} alt="logo" className="max-h-16 mx-auto" />
                  ) : (
                    <p className="text-xs text-[var(--ink-faint)]">로고 이미지 클릭 업로드 (PNG 권장)</p>
                  )}
                  <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0] ?? null)} />
                </div>
                {logoDataUrl && (
                  <label className="flex items-center gap-2 text-xs text-[var(--ink)] mt-2 cursor-pointer">
                    <input type="checkbox" checked={useLogoRef} onChange={(e) => setUseLogoRef(e.target.checked)} className="accent-[var(--accent)]" />
                    로고를 매 장면 이미지에 반영 시도 (reference)
                  </label>
                )}
              </div>

              <div>
                {/* 입력 방식: 주제로 AI 생성 vs 원고 직접 입력 */}
                <div className="flex gap-2 mb-2">
                  {([["topic", "주제로 생성"], ["script", "원고 직접 입력"]] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setCorpInput(val)}
                      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                        corpInput === val
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-medium"
                          : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {corpInput === "topic" ? (
                  <Textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="예: 우리 회사는 철갑상어 오일을 연구하는 바이오 기업입니다. 제품 신뢰성과 연구 역량을 강조해 주세요. (AI가 홍보 원고를 작성합니다)"
                    rows={3}
                    className="resize-none bg-[var(--paper-sunken)] border-[var(--line)] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus-visible:ring-[var(--accent)]"
                  />
                ) : (
                  <Textarea
                    value={scriptText}
                    onChange={(e) => setScriptText(e.target.value)}
                    placeholder="완성된 홍보 원고를 그대로 붙여넣으세요. 사실·문구를 보존하며 장면별 나레이션으로 변환합니다."
                    rows={6}
                    className="resize-none bg-[var(--paper-sunken)] border-[var(--line)] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus-visible:ring-[var(--accent)]"
                  />
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="faithful">
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-[var(--line)] rounded-[var(--radius)] p-10 text-center cursor-pointer hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
            >
              <p className="text-[var(--ink-soft)] text-sm">
                {file ? file.name : t("uploadPlaceholder")}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* 영상 길이 — 슬라이더 자유 입력 */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <p className="text-sm font-medium text-[var(--ink)]">{t("length")}</p>
            <p className="text-sm text-[var(--ink-soft)]">
              <span className="font-semibold text-[var(--accent)]">{formatLength(targetLength)}</span>
              <span className="text-xs text-[var(--ink-faint)]"> · 약 {sceneCountForLength(targetLength)}장면</span>
            </p>
          </div>
          <input
            type="range"
            min={MIN_LENGTH}
            max={MAX_LENGTH}
            step={10}
            value={targetLength}
            onChange={(e) => setTargetLength(Number(e.target.value))}
            className="w-full accent-[var(--accent)] cursor-pointer"
          />
          <div className="flex justify-between mt-2">
            {LENGTH_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setTargetLength(p)}
                className={`text-xs px-2 py-1 rounded-[var(--radius)] transition-colors ${
                  targetLength === p
                    ? "text-[var(--accent)] font-semibold"
                    : "text-[var(--ink-faint)] hover:text-[var(--accent)]"
                }`}
              >
                {formatLength(p)}
              </button>
            ))}
          </div>
        </section>

        {/* 화면 비율 */}
        <section>
          <p className="text-sm font-medium text-[var(--ink)] mb-3">화면 비율</p>
          <div className="flex gap-3">
            {ASPECTS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => setAspect(a.value)}
                className={`flex-1 py-3 rounded-[var(--radius)] border text-sm font-medium transition-colors flex flex-col items-center gap-1 ${
                  aspect === a.value
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent)]"
                }`}
              >
                <span className="text-lg leading-none">{a.icon}</span>
                <span>{a.label}</span>
                <span className="text-xs text-[var(--ink-faint)]">{a.sub}</span>
              </button>
            ))}
          </div>
        </section>

        {/* 화풍 선택 — 샘플 이미지 카드 */}
        <section>
          <p className="text-sm font-medium text-[var(--ink)] mb-3">{t("style")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {STYLE_PACKS.map((pack) => (
              <StyleCard
                key={pack.id}
                pack={pack}
                selected={stylePackId === pack.id}
                onClick={() => setStylePackId(pack.id)}
              />
            ))}
          </div>
        </section>

        {/* 목소리 선택 */}
        <section>
          <p className="text-sm font-medium text-[var(--ink)] mb-3">{t("voice")}</p>
          <div className="grid grid-cols-2 gap-2">
            {voices.map((v) => (
              <div
                key={v.id}
                className={`flex items-center justify-between p-3 rounded-[var(--radius)] border cursor-pointer transition-colors ${
                  voiceId === v.id
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--line)] hover:border-[var(--accent)]"
                }`}
                onClick={() => setVoiceId(v.id)}
              >
                <span className="text-sm text-[var(--ink)]">{v.name}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); previewVoice(v); }}
                  className="text-[var(--ink-faint)] hover:text-[var(--accent)] text-xs px-2"
                >
                  ▶
                </button>
              </div>
            ))}
          </div>
          <audio ref={audioRef} className="hidden" />
        </section>

        {error && <p className="text-sm text-[var(--accent)]">{error}</p>}

        <Button
          type="submit"
          disabled={loading}
          className="w-full py-6 text-base bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white rounded-[var(--radius)]"
        >
          {loading ? "생성 중..." : t("generate")}
        </Button>
      </form>
    </main>
  );
}

// 화풍별 샘플 이미지 (Storage 고정 경로). 없으면 이모지로 폴백.
const SAMPLE_BASE = "https://storage.googleapis.com/golpo-b6407.firebasestorage.app/style-samples";

function StyleCard({
  pack,
  selected,
  onClick,
}: {
  pack: { id: StylePackId; name: string; desc: string; emoji: string };
  selected: boolean;
  onClick: () => void;
}) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[var(--radius)] border overflow-hidden text-left transition-all ${
        selected
          ? "border-[var(--accent)] ring-2 ring-[var(--accent)]"
          : "border-[var(--line)] hover:border-[var(--accent)]"
      }`}
    >
      <div className="aspect-[3/4] bg-[var(--paper-sunken)] flex items-center justify-center overflow-hidden">
        {imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${SAMPLE_BASE}/${pack.id}.png`}
            alt={pack.name}
            onError={() => setImgOk(false)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-4xl">{pack.emoji}</span>
        )}
      </div>
      <div className="p-2">
        <p className="text-sm font-medium text-[var(--ink)] truncate">{pack.emoji} {pack.name}</p>
        <p className="text-xs text-[var(--ink-soft)] line-clamp-2">{pack.desc}</p>
      </div>
    </button>
  );
}
