"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { ProjectDoc } from "@/lib/types";
import { formatLength } from "@/lib/length";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface ProjectWithId extends ProjectDoc { id: string }

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:        { label: "초안", color: "bg-[var(--paper-sunken)] text-[var(--ink-faint)]" },
  script_ready: { label: "원고 검토", color: "bg-yellow-100 text-yellow-700" },
  approved:     { label: "생성 대기", color: "bg-blue-100 text-blue-700" },
  generating:   { label: "생성 중", color: "bg-blue-100 text-blue-700" },
  rendering:    { label: "렌더링 중", color: "bg-purple-100 text-purple-700" },
  done:         { label: "완성", color: "bg-green-100 text-green-700" },
  error:        { label: "오류", color: "bg-red-100 text-red-600" },
};

const STYLE_EMOJI: Record<string, string> = {
  whiteboard: "✏️",
  "ink-wash": "🖌️",
  minhwa: "🐯",
};

export default function DashboardClient() {
  const t = useTranslations("dashboard");
  const { user, loading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const locale = params.locale as string;

  const [projects, setProjects] = useState<ProjectWithId[]>([]);
  const [fetching, setFetching] = useState(true);
  const [queryError, setQueryError] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push(`/${locale}/auth/signin`);
      return;
    }

    const q = query(
      collection(db, "projects"),
      where("ownerId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectWithId)));
        setFetching(false);
        setQueryError(false);
      },
      (err) => {
        // 복합 인덱스 미생성 시 여기로 (failed-precondition). 무한 스켈레톤 방지.
        console.error("dashboard query failed:", err);
        setFetching(false);
        setQueryError(true);
      }
    );

    return unsub;
  }, [user, loading, locale, router]);

  if (loading || fetching) {
    return (
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-16">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-[var(--radius)] bg-[var(--paper-sunken)] animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  if (queryError) {
    return (
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 mb-4 rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-2xl">
            ⚠️
          </div>
          <p className="text-[var(--ink)] font-medium">목록을 불러오지 못했습니다</p>
          <p className="text-sm text-[var(--ink-soft)] mt-1 max-w-md">
            Firestore 인덱스가 아직 생성되지 않았을 수 있습니다. 잠시 후 다시 시도해 주세요.
          </p>
          <button
            onClick={() => location.reload()}
            className="mt-5 px-4 py-2 rounded-[var(--radius)] border border-[var(--line)] text-sm text-[var(--ink)] hover:bg-[var(--paper-sunken)]"
          >
            새로고침
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-[var(--ink)]">{t("title")}</h1>
        <button
          onClick={() => router.push(`/${locale}/create`)}
          className="px-4 py-2 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {t("newProject")}
        </button>
      </div>

      {projects.length === 0 ? (
        <EmptyState t={t} onNew={() => router.push(`/${locale}/create`)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => router.push(`/${locale}/project/${project.id}`)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function ProjectCard({ project, onClick }: { project: ProjectWithId; onClick: () => void }) {
  const status = STATUS_LABEL[project.status] ?? { label: project.status, color: "" };
  const isGenerating = project.status === "generating" || project.status === "rendering";

  return (
    <div
      onClick={onClick}
      className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-[var(--radius)] p-4 cursor-pointer hover:border-[var(--accent)] hover:shadow-[var(--shadow-md)] transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xl">{STYLE_EMOJI[project.stylePackId] ?? "🎬"}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
          {status.label}
        </span>
      </div>
      <h3 className="font-medium text-[var(--ink)] text-sm line-clamp-2 mb-2">
        {project.title || "제목 없음"}
      </h3>
      <p className="text-xs text-[var(--ink-faint)]">
        {formatLength(project.targetLength)} · {project.mode === "generate" ? "생성 모드" : "충실 모드"}
      </p>
      {isGenerating && (
        <Progress value={30} className="h-0.5 mt-3" />
      )}
    </div>
  );
}

function EmptyState({ t, onNew }: { t: ReturnType<typeof useTranslations>; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <div className="w-24 h-24 mb-6 rounded-full bg-[var(--paper-sunken)] flex items-center justify-center text-4xl">
        🎬
      </div>
      <p className="text-lg font-medium text-[var(--ink)]">{t("empty")}</p>
      <p className="text-sm text-[var(--ink-soft)] mt-1 mb-6">{t("emptyDesc")}</p>
      <button
        onClick={onNew}
        className="px-6 py-3 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
      >
        {t("newProject")}
      </button>
    </div>
  );
}
