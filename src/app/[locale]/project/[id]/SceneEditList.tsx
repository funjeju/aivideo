"use client";

import { useState } from "react";
import { SceneDoc } from "@/lib/types";

interface SceneWithId extends SceneDoc { id: string }

interface Props {
  projectId: string;
  scenes: SceneWithId[];
  /** 편집(재생성/문장수정)이 끝나 재렌더가 필요해졌을 때 */
  onDirty: () => void;
}

export default function SceneEditList({ projectId, scenes, onDirty }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {scenes.map((scene, i) => (
        <SceneEditCard key={scene.id} index={i} projectId={projectId} scene={scene} onDirty={onDirty} />
      ))}
    </div>
  );
}

function SceneEditCard({
  index, projectId, scene, onDirty,
}: { index: number; projectId: string; scene: SceneWithId; onDirty: () => void }) {
  const [narration, setNarration] = useState(scene.narration ?? "");
  const [busy, setBusy] = useState<"" | "text" | "image">("");
  const [done, setDone] = useState<"" | "text" | "image">("");

  const textChanged = narration.trim() !== (scene.narration ?? "").trim();

  async function downloadImage() {
    if (!scene.imageUrl) return;
    const filename = `scene-${String(index + 1).padStart(2, "0")}.png`;
    try {
      // GCS는 교차 도메인이라 <a download>가 무시됨 → blob으로 받아 저장(버킷 CORS * GET 설정됨)
      const res = await fetch(scene.imageUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // CORS/네트워크 실패 시 새 탭 폴백(사용자가 우클릭 저장)
      window.open(scene.imageUrl, "_blank");
    }
  }

  async function call(action: "update-text" | "regenerate-image") {
    setBusy(action === "update-text" ? "text" : "image");
    setDone("");
    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      const res = await fetch("/api/edit/scene", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          projectId,
          sceneId: scene.id,
          action,
          ...(action === "update-text" ? { narration } : {}),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert("실패: " + (e.error ?? res.status));
        return;
      }
      setDone(action === "update-text" ? "text" : "image");
      onDirty();
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="flex gap-3 bg-[var(--paper-raised)] border border-[var(--line)] rounded-[var(--radius)] p-3">
      {/* 썸네일 — 클릭 시 다운로드 */}
      <button
        type="button"
        onClick={downloadImage}
        disabled={!scene.imageUrl}
        title={scene.imageUrl ? "클릭해서 이미지 저장" : undefined}
        className="group relative w-28 h-44 flex-shrink-0 rounded-lg overflow-hidden bg-[var(--paper-sunken)] flex items-center justify-center disabled:cursor-default"
      >
        {scene.imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={scene.imageUrl} alt={`scene ${index + 1}`} className="w-full h-full object-cover" />
            <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/40 text-white text-[10px] font-medium">
              ⬇ 저장
            </span>
          </>
        ) : (
          <span className="text-xs text-[var(--ink-faint)]">없음</span>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-mono text-[var(--ink-faint)] bg-[var(--paper-sunken)] px-1.5 py-0.5 rounded">
            {String(index + 1).padStart(2, "0")}
          </span>
          {scene.visualIntent && (
            <span className="text-xs text-[var(--ink-faint)] truncate">🎨 {scene.visualIntent}</span>
          )}
        </div>

        <textarea
          value={narration}
          onChange={(e) => setNarration(e.target.value)}
          rows={2}
          className="w-full resize-none text-sm text-[var(--ink)] bg-transparent border border-[var(--line)] rounded p-2 focus:outline-none focus:border-[var(--accent)]"
        />

        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => call("update-text")}
            disabled={!textChanged || busy !== ""}
            className="text-xs px-3 py-1.5 rounded-md bg-[var(--accent)] text-white disabled:opacity-40 hover:opacity-90"
          >
            {busy === "text" ? "적용 중..." : "문장 수정"}
          </button>
          <button
            onClick={() => call("regenerate-image")}
            disabled={busy !== ""}
            className="text-xs px-3 py-1.5 rounded-md border border-[var(--line)] text-[var(--ink)] disabled:opacity-40 hover:bg-[var(--paper-sunken)]"
          >
            {busy === "image" ? "생성 중..." : "이 그림 다시"}
          </button>
          <button
            onClick={downloadImage}
            disabled={!scene.imageUrl}
            className="text-xs px-3 py-1.5 rounded-md border border-[var(--line)] text-[var(--ink)] disabled:opacity-40 hover:bg-[var(--paper-sunken)]"
          >
            이미지 저장
          </button>
          {done === "text" && <span className="text-xs text-green-600">문장·음성 갱신됨</span>}
          {done === "image" && <span className="text-xs text-green-600">새 그림 생성됨</span>}
        </div>
      </div>
    </div>
  );
}
