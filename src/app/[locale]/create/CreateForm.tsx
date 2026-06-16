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

  const [mode, setMode] = useState<"generate" | "faithful">("generate");
  const [topic, setTopic] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [targetLength, setTargetLength] = useState<TargetLength>(60);
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [stylePackId, setStylePackId] = useState<StylePackId>("whiteboard");
  const [voiceId, setVoiceId] = useState("nova");
  const [voices, setVoices] = useState<{ id: string; name: string }[]>(FALLBACK_VOICES);
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
            .map((d) => d.data() as { id: string; displayName: string; sortOrder?: number })
            .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
            .map((v) => ({ id: v.id, name: v.displayName }));
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

    setLoading(true);
    setError("");

    try {
      // 1. 프로젝트 생성
      const formData = new FormData();
      formData.append("ownerId", user.uid);
      formData.append("mode", mode);
      formData.append("targetLength", String(targetLength));
      formData.append("aspect", aspect);
      formData.append("stylePackId", stylePackId);
      formData.append("voiceId", voiceId);
      formData.append("contentLocale", "ko");
      if (mode === "generate") formData.append("topic", topic);
      if (mode === "faithful" && file) formData.append("file", file);

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
        body: JSON.stringify({ projectId, mode, topic, targetLength, contentLocale: "ko" }),
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

  function previewVoice(v: { id: string }) {
    const audio = audioRef.current;
    if (!audio) return;
    // src만 바꾸면 이전 소스가 이어 재생되는 브라우저가 있어 명시적으로 정지→교체→로드
    audio.pause();
    audio.src = `/api/voice-preview?voiceId=${v.id}&t=${Date.now()}`;
    audio.load();
    audio.play().catch(() => {});
  }

  return (
    <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl font-semibold text-[var(--ink)] mb-8">{t("title")}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        {/* 입력 모드 탭 */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as "generate" | "faithful")}>
          <TabsList className="w-full mb-4">
            <TabsTrigger value="generate" className="flex-1">{t("modeGenerate")}</TabsTrigger>
            <TabsTrigger value="faithful" className="flex-1">{t("modeFaithful")}</TabsTrigger>
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

        {/* 화풍 선택 */}
        <section>
          <p className="text-sm font-medium text-[var(--ink)] mb-3">{t("style")}</p>
          <div className="flex flex-col gap-2">
            {STYLE_PACKS.map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => setStylePackId(pack.id)}
                className={`flex items-center gap-4 p-4 rounded-[var(--radius)] border text-left transition-colors ${
                  stylePackId === pack.id
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--line)] hover:border-[var(--accent)]"
                }`}
              >
                <span className="text-2xl">{pack.emoji}</span>
                <div>
                  <p className="text-sm font-medium text-[var(--ink)]">{pack.name}</p>
                  <p className="text-xs text-[var(--ink-soft)]">{pack.desc}</p>
                </div>
              </button>
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
