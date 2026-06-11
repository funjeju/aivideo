"use client";

import { useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { StylePackId, TargetLength } from "@/lib/types";

const TARGET_LENGTHS: { value: TargetLength; label: string }[] = [
  { value: 50, label: "50초 숏폼" },
  { value: 180, label: "3분" },
  { value: 600, label: "10분" },
];

const STYLE_PACKS: { id: StylePackId; name: string; desc: string; emoji: string }[] = [
  { id: "whiteboard", name: "클래식 화이트보드", desc: "깔끔한 설명 영상 기본기", emoji: "✏️" },
  { id: "ink-wash", name: "수묵담채", desc: "한지 위 먹선, 심리·철학·역사", emoji: "🖌️" },
  { id: "minhwa", name: "민화/조선", desc: "오방색 모티프, 한국사·문화", emoji: "🐯" },
];

const VOICES = [
  { id: "nova", name: "따뜻한 여성", provider: "openai" },
  { id: "shimmer", name: "차분한 여성", provider: "openai" },
  { id: "echo", name: "낮은 남성", provider: "openai" },
  { id: "onyx", name: "중후한 남성", provider: "openai" },
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
  const [targetLength, setTargetLength] = useState<TargetLength>(180);
  const [stylePackId, setStylePackId] = useState<StylePackId>("whiteboard");
  const [voiceId, setVoiceId] = useState("nova");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

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
      formData.append("stylePackId", stylePackId);
      formData.append("voiceId", voiceId);
      formData.append("contentLocale", "ko");
      if (mode === "generate") formData.append("topic", topic);
      if (mode === "faithful" && file) formData.append("file", file);

      const projRes = await fetch("/api/projects", { method: "POST", body: formData });
      const { projectId, error: projErr } = await projRes.json();
      if (projErr) throw new Error(projErr);

      // 2. 원고 생성
      const scriptRes = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  function previewVoice(v: typeof VOICES[0]) {
    // OpenAI 보이스는 캐시된 샘플 없으면 안내만
    if (audioRef.current) {
      audioRef.current.src = `/api/voice-preview?voiceId=${v.id}`;
      audioRef.current.play().catch(() => {});
    }
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

        {/* 영상 길이 */}
        <section>
          <p className="text-sm font-medium text-[var(--ink)] mb-3">{t("length")}</p>
          <div className="flex gap-3">
            {TARGET_LENGTHS.map((l) => (
              <button
                key={l.value}
                type="button"
                onClick={() => setTargetLength(l.value)}
                className={`flex-1 py-3 rounded-[var(--radius)] border text-sm font-medium transition-colors ${
                  targetLength === l.value
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent)]"
                }`}
              >
                {l.label}
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
            {VOICES.map((v) => (
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
