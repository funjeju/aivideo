"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  doc, collection, onSnapshot, updateDoc, query, orderBy, where, limit
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { ProjectDoc, SceneDoc, SceneSpec, RenderJobDoc } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import ScenePlayer from "@/components/render/ScenePlayer";
import SceneEditList from "./SceneEditList";

interface SceneWithId extends SceneDoc { id: string }

type ViewState = "loading" | "script_approval" | "generating" | "rendering" | "done" | "error";

export default function ProjectView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const [project, setProject] = useState<(ProjectDoc & { generateProgress?: number; outputUrl?: string }) | null>(null);
  const [scenes, setScenes] = useState<SceneWithId[]>([]);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [editedNarrations, setEditedNarrations] = useState<Record<string, string>>({});
  const [approving, setApproving] = useState(false);
  const [ttsProgress, setTtsProgress] = useState(0);
  const [renderJob, setRenderJob] = useState<RenderJobDoc | null>(null);
  const [rendering, setRendering] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // 진행률이 마지막으로 "증가한" 시각. 이게 오래 안 바뀌면 정체로 본다.
  // (updatedAt은 progress 갱신 시 안 바뀌어 오탐 발생 → progress 변화 기준으로 판단)
  const [progressChangedAt, setProgressChangedAt] = useState(() => Date.now());
  const lastProgressRef = useRef<number | null>(null);
  // status가 "approved"(=생성 트리거 안 됨)일 때 클라가 직접 생성을 켠다. 마운트당 1회.
  const genTriggeredRef = useRef(false);

  // 정체 감지용 시계 (30초마다) — generating이 멈췄는지 판단
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // 생성 파이프라인을 클라이언트에서 직접 트리거(브라우저 디스패치는 Vercel처럼 잘리지 않음).
  // 서버측 approve→generate fire-and-forget이 실패해도 이 경로로 확실히 시작된다.
  async function triggerGenerate() {
    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId }),
      });
    } catch (e) {
      console.error("generate trigger failed:", e);
    }
  }

  async function handleResume() {
    if (resuming) return;
    setResuming(true);
    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      // 멱등 재개 — 완료된 장면은 자동 스킵, 멈춘 지점부터 이어서 처리.
      // 응답까지 수분 걸릴 수 있으나 onSnapshot이 진행률을 실시간 갱신한다.
      await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId }),
      });
    } catch (e) {
      console.error("resume failed:", e);
    } finally {
      setResuming(false);
    }
  }

  useEffect(() => {
    const projRef = doc(db, "projects", projectId);
    const unsubProj = onSnapshot(projRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as ProjectDoc & { generateProgress?: number };
      setProject(data);

      // 진행률이 올라갈 때마다 정체 타이머 리셋 (실제 활동 기준)
      const gp = data.generateProgress ?? 0;
      if (lastProgressRef.current === null || gp !== lastProgressRef.current) {
        lastProgressRef.current = gp;
        setProgressChangedAt(Date.now());
      }

      if (data.status === "script_ready" && !data.scriptApproved) setViewState("script_approval");
      else if (data.status === "approved" || data.status === "generating") {
        setViewState("generating");
        // status가 "approved"에 멈춰 있으면 생성이 시작 안 된 것 → 클라가 직접 트리거(마운트당 1회).
        // generate가 즉시 status를 "generating"으로 바꾸므로 중복 트리거 안 됨.
        if (data.status === "approved" && !genTriggeredRef.current) {
          genTriggeredRef.current = true;
          triggerGenerate();
        }
      }
      else if (data.status === "rendering") setViewState("rendering");
      else if (data.status === "done") setViewState("done");
      else if (data.status === "error") setViewState("error");
    });

    const scenesQ = query(collection(db, "projects", projectId, "scenes"), orderBy("order"));
    const unsubScenes = onSnapshot(scenesQ, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SceneWithId));
      setScenes(list);
    });

    // 최신 렌더 작업 구독 (진행률용)
    const jobsQ = query(
      collection(db, "renderJobs"),
      where("projectId", "==", projectId),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    const unsubJobs = onSnapshot(jobsQ, (snap) => {
      if (!snap.empty) setRenderJob(snap.docs[0].data() as RenderJobDoc);
    });

    return () => { unsubProj(); unsubScenes(); unsubJobs(); };
    // triggerGenerate는 projectId 클로저라 재실행 불필요 (구독은 projectId에만 의존)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function chooseThumbnail(url: string) {
    try {
      await updateDoc(doc(db, "projects", projectId), { thumbnailUrl: url });
    } catch (e) {
      console.error("thumbnail update failed:", e);
    }
  }

  async function handleRender() {
    setRendering(true);
    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId }),
      });
      setDirty(false);
    } catch (e) {
      console.error(e);
    } finally {
      setRendering(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      // 수정된 나레이션 저장
      for (const [sceneId, narration] of Object.entries(editedNarrations)) {
        await updateDoc(doc(db, "projects", projectId, "scenes", sceneId), { narration });
      }

      // TTS 합성 — 동시 3개 제한 + 45초 타임아웃 + 1회 재시도 (행 방지)
      const targetScenes = scenes.map((s) => ({
        ...s,
        narration: editedNarrations[s.id] ?? s.narration,
      }));

      let done = 0;
      const failed: string[] = [];

      async function synthOne(scene: { id: string; narration: string }) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch("/api/tts", {
              method: "POST",
              headers: authHeaders,
              signal: AbortSignal.timeout(45000),
              body: JSON.stringify({
                projectId,
                sceneId: scene.id,
                narration: scene.narration,
                voiceId: project?.voiceId ?? "nova",
              }),
            });
            if (res.ok) return;
          } catch {
            // 타임아웃/네트워크 — 재시도
          }
        }
        failed.push(scene.id);
      }

      const CONCURRENCY = 3;
      for (let i = 0; i < targetScenes.length; i += CONCURRENCY) {
        await Promise.all(
          targetScenes.slice(i, i + CONCURRENCY).map(async (scene) => {
            await synthOne(scene);
            done++;
            setTtsProgress(Math.round((done / targetScenes.length) * 100));
          })
        );
      }

      if (failed.length > 0) {
        alert(`${failed.length}개 장면의 음성 합성에 실패했습니다. "승인하고 영상 만들기"를 다시 눌러 주세요.`);
        setApproving(false);
        return;
      }

      // 승인
      const apRes = await fetch("/api/approve", {
        method: "POST",
        headers: authHeaders,
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ projectId }),
      });
      if (apRes.status === 402) {
        const d = await apRes.json().catch(() => ({}));
        alert(`크레딧이 부족합니다. (보유 $${(d.credits ?? 0).toFixed?.(2) ?? d.credits} / 필요 약 $${d.estimate})\n관리자에게 문의하거나 크레딧을 충전해 주세요.`);
        setApproving(false);
        return;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setApproving(false);
    }
  }

  if (viewState === "loading") {
    return <LoadingView />;
  }

  if (viewState === "script_approval") {
    return (
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <div className="mb-8">
          <p className="text-xs text-[var(--ink-faint)] uppercase tracking-wider mb-1">원고 검토</p>
          <h1 className="text-2xl font-semibold text-[var(--ink)]">{project?.title ?? "원고 검토"}</h1>
          <p className="text-sm text-[var(--ink-soft)] mt-1">
            나레이션을 확인·수정하세요. 승인 후 이미지 생성이 시작됩니다.
          </p>
        </div>

        <div className="flex flex-col gap-4 mb-8">
          {scenes.map((scene, i) => (
            <div key={scene.id} className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-[var(--radius)] p-4">
              <div className="flex items-start gap-3">
                <span className="text-xs font-mono text-[var(--ink-faint)] bg-[var(--paper-sunken)] px-2 py-1 rounded mt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <textarea
                    value={editedNarrations[scene.id] ?? scene.narration}
                    onChange={(e) =>
                      setEditedNarrations((prev) => ({ ...prev, [scene.id]: e.target.value }))
                    }
                    rows={3}
                    className="w-full resize-none bg-transparent text-sm text-[var(--ink)] focus:outline-none leading-relaxed"
                  />
                  {scene.visualIntent && (
                    <p className="text-xs text-[var(--ink-faint)] mt-2 border-t border-[var(--line)] pt-2">
                      🎨 {scene.visualIntent}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {approving && (
          <div className="mb-4">
            <p className="text-sm text-[var(--ink-soft)] mb-2">음성 합성 중... {ttsProgress}%</p>
            <Progress value={ttsProgress} className="h-1" />
          </div>
        )}

        <Button
          onClick={handleApprove}
          disabled={approving}
          className="w-full py-6 text-base bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white rounded-[var(--radius)]"
        >
          {approving ? "처리 중..." : "승인하고 영상 만들기"}
        </Button>
      </main>
    );
  }

  if (viewState === "generating") {
    const progress = project?.generateProgress ?? 0;
    // 정체 감지: 진행률이 8분 이상 멈춰 있으면 함수가 죽은 것으로 보고 재개 버튼 노출.
    // (이미지 생성이 장당 수 분 걸려 정상이어도 진행률 간격이 길다 → 임계 8분)
    const stuck = progress < 100 && now - progressChangedAt > 8 * 60 * 1000;

    // 단계별 완료 — scenes의 필드를 실시간 집계 (지나가는 텍스트 대신 단계별 완료 표시)
    const total = scenes.length || 1;
    const audioDone = scenes.filter((s) => s.audioUrl).length;
    const imageDone = scenes.filter((s) => s.imageUrl || s.imageStatus === "done").length;
    const specDone = scenes.filter((s) => (s.sceneSpec as SceneSpec | undefined)?.reveal).length;
    const stages: { label: string; done: number; total: number }[] = [
      { label: "원고 작성", done: scenes.length, total: scenes.length },
      { label: "음성 합성", done: audioDone, total },
      { label: "이미지 생성", done: imageDone, total },
      { label: "연출 구성", done: specDone, total },
    ];
    // 첫 미완료 단계 = 현재 진행 중. 그 앞은 완료, 뒤는 대기.
    const activeIdx = stages.findIndex((s) => s.done < s.total);

    return (
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold text-[var(--ink)] mb-1 text-center">영상 생성 중</h2>
          <p className="text-xs text-[var(--ink-faint)] mb-6 text-center">{progress}% · 총 {scenes.length}장면</p>

          <ol className="flex flex-col gap-1 mb-2">
            {stages.map((s, i) => {
              const state: StageState =
                s.done >= s.total ? "done" : activeIdx === -1 || i === activeIdx ? "active" : "pending";
              return <StageRow key={s.label} label={s.label} done={s.done} total={s.total} state={state} animate={!stuck} />;
            })}
          </ol>

          <Progress value={progress} className="h-1.5 mt-4" />

          {stuck && (
            <div className="mt-6 p-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper-sunken)]">
              <p className="text-sm text-[var(--ink)] mb-3">
                생성이 5분 이상 멈춰 있습니다. 처리가 중단됐을 수 있어요.
                <br />아래 버튼을 누르면 멈춘 지점부터 이어서 생성합니다.
              </p>
              <Button onClick={handleResume} disabled={resuming} className="w-full">
                {resuming ? "재개 중..." : "이어서 생성하기"}
              </Button>
            </div>
          )}
        </div>
      </main>
    );
  }

  const sceneSpecs: SceneSpec[] = scenes
    .filter((s) => s.sceneSpec)
    .map((s) => ({
      ...(s.sceneSpec as SceneSpec),
      audioUrl: s.audioUrl ?? s.sceneSpec?.audioUrl,
      durationSec: s.durationSec || s.sceneSpec?.durationSec || 3,
      image: s.imageUrl ? { url: s.imageUrl, fit: "contain" } : s.sceneSpec?.image,
    }));

  if (viewState === "rendering") {
    const pct = renderJob?.progress ?? 0;
    return (
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-[var(--ink)]">{project?.title ?? "렌더링"}</h1>
          <Button variant="outline" onClick={() => router.push(`/${locale}/dashboard`)}>
            대시보드로
          </Button>
        </div>

        {sceneSpecs.length > 0 && <ScenePlayer scenes={sceneSpecs} />}

        <div className="mt-6 bg-[var(--paper-raised)] border border-[var(--line)] rounded-[var(--radius)] p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-[var(--ink)]">mp4 렌더링 중</p>
            <span className="text-sm text-[var(--ink-soft)] tabular-nums">{pct}%</span>
          </div>
          <Progress value={pct} className="h-1.5" />
          <p className="text-xs text-[var(--ink-faint)] mt-2">
            프레임 캡처 → 음성 합성 → mp4 인코딩. 영상 길이에 따라 수 분 걸릴 수 있습니다.
          </p>
        </div>
      </main>
    );
  }

  if (viewState === "done") {
    const outputUrl = project?.outputUrl ?? renderJob?.outputUrl;

    return (
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-[var(--ink)]">{project?.title ?? "완성"}</h1>
          <Button variant="outline" onClick={() => router.push(`/${locale}/dashboard`)}>
            대시보드로
          </Button>
        </div>

        {sceneSpecs.length > 0 ? (
          <ScenePlayer scenes={sceneSpecs} />
        ) : (
          <p className="text-[var(--ink-soft)]">장면 데이터를 불러오는 중...</p>
        )}

        <div className="mt-6 flex items-center gap-3 flex-wrap">
          {outputUrl ? (
            <>
              <a
                href={outputUrl}
                download
                className="px-5 py-3 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                mp4 다운로드
              </a>
              <Button variant="outline" onClick={handleRender} disabled={rendering}>
                {dirty ? "변경사항으로 다시 렌더링" : "다시 렌더링"}
              </Button>
            </>
          ) : (
            <Button
              onClick={handleRender}
              disabled={rendering}
              className="px-6 py-6 text-base bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white rounded-[var(--radius)]"
            >
              {rendering ? "등록 중..." : "mp4로 만들기"}
            </Button>
          )}
        </div>

        {dirty && (
          <div className="mt-3 text-xs text-[var(--accent)] bg-[var(--accent-soft)] rounded-[var(--radius)] px-3 py-2 inline-block">
            장면을 수정했습니다. &quot;다시 렌더링&quot;을 눌러 새 영상에 반영하세요.
          </div>
        )}

        <p className="text-xs text-[var(--ink-faint)] mt-3">
          위는 브라우저 프리뷰입니다. &quot;mp4로 만들기&quot;를 누르면 동일한 화면이 영상 파일로 렌더링됩니다.
        </p>

        {/* 썸네일 선택 — 대시보드 대표 이미지 */}
        {scenes.some((s) => s.imageUrl) && (
          <div className="mt-10">
            <h2 className="text-sm font-semibold text-[var(--ink)] mb-1">썸네일 선택</h2>
            <p className="text-xs text-[var(--ink-soft)] mb-3">대시보드 목록에 표시될 대표 이미지를 고르세요.</p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {scenes.filter((s) => s.imageUrl).map((s, i) => {
                const selected = (project?.thumbnailUrl ?? "") === s.imageUrl;
                return (
                  <button
                    key={s.id}
                    onClick={() => chooseThumbnail(s.imageUrl!)}
                    title={`장면 ${i + 1}`}
                    className={`relative flex-shrink-0 w-16 h-24 rounded overflow-hidden border-2 transition-colors ${
                      selected ? "border-[var(--accent)]" : "border-[var(--line)] hover:border-[var(--accent)]"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.imageUrl} alt={`장면 ${i + 1}`} className="w-full h-full object-cover" />
                    {selected && (
                      <span className="absolute bottom-0 inset-x-0 bg-[var(--accent)] text-white text-[10px] text-center leading-4">대표</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 장면별 사후 편집 */}
        <div className="mt-10">
          <h2 className="text-sm font-semibold text-[var(--ink)] mb-1">장면 편집</h2>
          <p className="text-xs text-[var(--ink-soft)] mb-4">
            문장을 고치거나 그림을 다시 그릴 수 있습니다. 변경 후 다시 렌더링하면 새 영상에 반영됩니다.
          </p>
          <SceneEditList projectId={projectId} scenes={scenes} onDirty={() => setDirty(true)} />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <p className="text-[var(--accent)]">오류가 발생했습니다. 다시 시도해 주세요.</p>
    </main>
  );
}

type StageState = "done" | "active" | "pending";

function StageRow({
  label, done, total, state, animate,
}: { label: string; done: number; total: number; state: StageState; animate: boolean }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="w-5 h-5 flex items-center justify-center shrink-0">
        {state === "done" ? (
          <svg viewBox="0 0 20 20" className="w-5 h-5 text-[var(--accent)]" fill="currentColor">
            <circle cx="10" cy="10" r="10" opacity="0.15" />
            <path d="M6 10.5l2.5 2.5 5-5.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : state === "active" ? (
          <span
            className={`w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent ${animate ? "animate-spin" : ""}`}
          />
        ) : (
          <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--line)]" />
        )}
      </span>

      <span className={`flex-1 text-sm ${state === "pending" ? "text-[var(--ink-faint)]" : "text-[var(--ink)]"}`}>
        {label}
      </span>

      <span className="text-xs tabular-nums text-[var(--ink-faint)]">
        {state === "done" ? "완료" : state === "pending" ? "대기" : `${done}/${total}`}
      </span>
    </li>
  );
}

function LoadingView() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[var(--ink-soft)]">원고 생성 중...</p>
      </div>
    </main>
  );
}
