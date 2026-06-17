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
  const [thumbBusy, setThumbBusy] = useState<string | null>(null); // 합성 중인 장면 이미지 URL
  const [thumbTitle, setThumbTitle] = useState(""); // 썸네일에 합성할 문구(편집 가능)
  const [localThumb, setLocalThumb] = useState(""); // 합성 직후 즉시 보여줄 로컬 미리보기(dataURL)
  const [shareCopied, setShareCopied] = useState(false);
  const thumbTitleInitRef = useRef(false); // thumbTitle 초기화 1회
  const thumbAutoRef = useRef(false); // 자동 썸네일 생성 1회
  const [cancelling, setCancelling] = useState(false);
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

  // 썸네일 편집 문구 초기화(1회): LLM 훅 → 없으면 제목
  useEffect(() => {
    if (thumbTitleInitRef.current || !project) return;
    setThumbTitle((project.thumbnailHook || project.title || "").trim());
    thumbTitleInitRef.current = true;
  }, [project]);

  // 자동 썸네일(1회): 완료됐고 아직 썸네일이 없으면 대표 장면+훅으로 자동 합성
  useEffect(() => {
    if (thumbAutoRef.current || !project) return;
    if (project.status !== "done" || project.thumbnailUrl) return;
    const src = keySceneImageUrl();
    if (!src) return;
    thumbAutoRef.current = true;
    chooseThumbnail(src, (project.thumbnailHook || project.title || "").trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, scenes]);

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

      // 처리 상태를 벗어나면 취소 버튼 상태 리셋
      if (data.status !== "generating" && data.status !== "rendering" && data.status !== "approved") {
        setCancelling(false);
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

  async function cancelProcessing() {
    if (cancelling) return;
    setCancelling(true);
    try {
      // 플래그만 세움 — 생성 루프(Vercel)·워커가 사이사이 확인해 중단한다
      await updateDoc(doc(db, "projects", projectId), { cancelRequested: true });
    } catch (e) {
      console.error("cancel failed:", e);
      setCancelling(false);
    }
  }

  // 장면 이미지 + 편집 문구를 합성(브라우저 canvas)해 서버에 저장. title 미지정 시 현재 thumbTitle 사용.
  // 나레이션 편집 자동저장(입력칸 포커스 아웃 시). 승인 안 해도 새로고침/이탈에 안 사라지게.
  async function saveNarration(sceneId: string) {
    const edited = editedNarrations[sceneId];
    if (edited === undefined) return;
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene || edited === scene.narration) return;
    try {
      await updateDoc(doc(db, "projects", projectId, "scenes", sceneId), { narration: edited });
    } catch (e) {
      console.error("narration save failed:", e);
    }
  }

  async function chooseThumbnail(url: string, title?: string) {
    if (thumbBusy) return;
    setThumbBusy(url);
    try {
      const text = (title ?? thumbTitle ?? project?.title ?? "").trim();
      const dataUrl = await composeThumbnail(url, text);
      // 합성 즉시 로컬 미리보기 갱신 — 업로드 왕복을 기다리지 않아 체감이 빠르다
      setLocalThumb(dataUrl);
      setThumbBusy(null);
      // 저장은 백그라운드 (UI는 이미 반영됨)
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      fetch("/api/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ projectId, dataUrl, sourceUrl: url }),
      }).then((res) => { if (!res.ok) console.error("thumbnail save failed", res.status); })
        .catch((e) => console.error("thumbnail save failed:", e));
    } catch (e) {
      console.error("thumbnail compose failed:", e);
      setThumbBusy(null);
    }
  }

  // 편집한 문구를 현재 선택된(없으면 대표 장면) 이미지에 다시 합성·적용
  function applyThumbnail() {
    const src = project?.thumbnailSourceUrl || keySceneImageUrl();
    if (src) chooseThumbnail(src, thumbTitle);
  }

  // keySceneOrder 장면 이미지(없으면 첫 이미지 장면) URL
  function keySceneImageUrl(): string | undefined {
    const withImg = scenes.filter((s) => s.imageUrl);
    if (withImg.length === 0) return undefined;
    const key = withImg.find((s) => s.order === project?.keySceneOrder);
    return (key ?? withImg[0]).imageUrl!;
  }

  async function copyShareLink() {
    const url = `${window.location.origin}/${locale}/share/${projectId}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      window.prompt("아래 링크를 복사하세요", url);
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

      // TTS 합성 — 동시 3개 + 45초 타임아웃 + 3회 시도(백오프).
      // 이미 음성이 있고 나레이션이 안 바뀐 장면은 건너뜀(멱등) → 재시도 시 실패분만 다시.
      const targetScenes = scenes.map((s) => ({
        id: s.id,
        narration: editedNarrations[s.id] ?? s.narration,
        hasAudio: !!s.audioUrl && !editedNarrations[s.id],
      }));

      const failed: string[] = [];

      async function synthOne(scene: { id: string; narration: string }) {
        for (let attempt = 0; attempt < 3; attempt++) {
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
            // 타임아웃/네트워크
          }
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); // 백오프
        }
        failed.push(scene.id);
      }

      const total = Math.max(targetScenes.length, 1);
      const pending = targetScenes.filter((s) => !s.hasAudio);
      let done = targetScenes.length - pending.length; // 건너뛴 건 완료로 카운트
      setTtsProgress(Math.round((done / total) * 100));

      const CONCURRENCY = 3;
      for (let i = 0; i < pending.length; i += CONCURRENCY) {
        await Promise.all(
          pending.slice(i, i + CONCURRENCY).map(async (scene) => {
            await synthOne(scene);
            done++;
            setTtsProgress(Math.round((done / total) * 100));
          })
        );
      }

      if (failed.length > 0) {
        alert(`${failed.length}개 장면의 음성 합성에 실패했습니다.\n"승인하고 영상 만들기"를 다시 누르면 실패한 장면만 다시 시도합니다(성공분은 건너뜀).`);
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
            나레이션을 확인·수정하세요. 수정은 자동 저장되며, 승인 후 이 원고로 음성·이미지가 만들어집니다.
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
                    onBlur={() => saveNarration(scene.id)}
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

          <button
            onClick={cancelProcessing}
            disabled={cancelling}
            className="mt-5 text-sm text-[var(--ink-faint)] hover:text-[var(--accent)] disabled:opacity-50 underline"
          >
            {cancelling ? "취소 중…" : "생성 취소"}
          </button>
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
          <button
            onClick={cancelProcessing}
            disabled={cancelling}
            className="mt-3 text-sm text-[var(--ink-faint)] hover:text-[var(--accent)] disabled:opacity-50 underline"
          >
            {cancelling ? "취소 중…" : "렌더링 취소"}
          </button>
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

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="flex-1 w-full">
            {sceneSpecs.length > 0 ? (
              <ScenePlayer scenes={sceneSpecs} />
            ) : (
              <p className="text-[var(--ink-soft)]">장면 데이터를 불러오는 중...</p>
            )}
            <p className="text-[10px] text-[var(--ink-faint)] mt-1 text-center">▲ 영상 미리보기</p>
          </div>

          {/* 공유 썸네일 — 카톡·블로그 등에 퍼갈 때 보이는 이미지 */}
          <div className="w-full lg:w-56 shrink-0">
            <p className="text-xs font-semibold text-[var(--ink)] mb-1">공유 썸네일</p>
            {(localThumb || project?.thumbnailUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={localThumb || project?.thumbnailUrl} alt="공유 썸네일" className="w-full rounded-lg border border-[var(--line)] shadow-[var(--shadow-md)]" />
            ) : (
              <div className="w-full aspect-[3/4] rounded-lg border border-dashed border-[var(--line)] flex items-center justify-center text-xs text-[var(--ink-faint)]">자동 생성 중…</div>
            )}
            <p className="text-[11px] text-[var(--ink-soft)] mt-2 leading-relaxed">카톡·블로그 등에 공유할 때 보이는 대표 이미지예요.</p>
            <a href="#thumb-editor" className="inline-block mt-1 text-xs text-[var(--accent)] hover:underline">문구·장면 수정 →</a>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3 flex-wrap">
          {outputUrl ? (
            <>
              <a
                href={outputUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-3 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                mp4 다운로드
              </a>
              <Button variant="outline" onClick={handleRender} disabled={rendering}>
                {dirty ? "변경사항으로 다시 렌더링" : "다시 렌더링"}
              </Button>
              <Button variant="outline" onClick={copyShareLink}>
                {shareCopied ? "복사됨 ✓" : "공유 링크 복사"}
              </Button>
              <a href={`/${locale}/share/${projectId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--ink-soft)] hover:text-[var(--accent)] self-center">
                공유 페이지 열기 ↗
              </a>
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
          <div id="thumb-editor" className="mt-10 scroll-mt-20">
            <h2 className="text-sm font-semibold text-[var(--ink)] mb-1">썸네일 (자동 생성 — 수정 가능)</h2>
            <p className="text-xs text-[var(--ink-soft)] mb-3">완성되면 가장 임팩트 있는 장면 + 자극적 훅으로 자동 생성됩니다. 아래에서 <b>문구·장면을 바꿔</b> 다시 적용할 수 있어요.</p>

            {/* 훅 문구 편집 */}
            <div className="flex gap-2 mb-3 max-w-md">
              <input
                value={thumbTitle}
                onChange={(e) => setThumbTitle(e.target.value)}
                placeholder="썸네일 문구 (자극적인 훅)"
                className="flex-1 px-3 py-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper-sunken)] text-sm text-[var(--ink)]"
              />
              <button
                onClick={applyThumbnail}
                disabled={thumbBusy !== null}
                className="px-4 py-2 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50 whitespace-nowrap"
              >
                {thumbBusy ? "적용 중…" : "문구 적용"}
              </button>
            </div>

            <p className="text-xs text-[var(--ink-soft)] mb-2">장면 선택 (클릭 시 현재 문구로 합성)</p>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {scenes.filter((s) => s.imageUrl).map((s, i) => {
                const selected = (project?.thumbnailSourceUrl ?? "") === s.imageUrl;
                const busy = thumbBusy === s.imageUrl;
                return (
                  <button
                    key={s.id}
                    onClick={() => chooseThumbnail(s.imageUrl!, thumbTitle)}
                    disabled={thumbBusy !== null}
                    title={`장면 ${i + 1}`}
                    className={`relative flex-shrink-0 w-28 h-44 rounded-lg overflow-hidden border-2 transition-colors disabled:opacity-60 ${
                      selected ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : "border-[var(--line)] hover:border-[var(--accent)]"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.imageUrl} alt={`장면 ${i + 1}`} className="w-full h-full object-cover" />
                    {busy && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white text-xs">합성 중…</span>
                    )}
                    {selected && !busy && (
                      <span className="absolute bottom-0 inset-x-0 bg-[var(--accent)] text-white text-[11px] text-center leading-5">대표</span>
                    )}
                  </button>
                );
              })}
            </div>
            {(localThumb || project?.thumbnailUrl) && (
              <div className="mt-4">
                <p className="text-xs text-[var(--ink-soft)] mb-1">현재 썸네일</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={localThumb || project?.thumbnailUrl} alt="썸네일" className="w-64 max-w-full rounded-lg border border-[var(--line)] shadow-[var(--shadow-md)]" />
              </div>
            )}
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

/** 장면 이미지 + 훅 제목(중앙 대형 + 반투명 박스)을 합성해 PNG data URL 반환 (브라우저 canvas) */
async function composeThumbnail(imageUrl: string, title: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous"; // GCS 교차도메인 → canvas 오염 방지(버킷 CORS *)
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = imageUrl;
  });
  const maxW = 720; // 썸네일용 — 1080은 과해서 합성·업로드만 느려짐. 720이면 충분히 또렷.
  const scale = Math.min(1, maxW / img.width);
  const W = Math.round(img.width * scale);
  const H = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, W, H);

  if (title) {
    const fontPx = Math.round(W * 0.082);
    ctx.font = `800 ${fontPx}px "Pretendard", "Noto Sans KR", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const maxTextW = W * 0.84;
    // 어절 단위 줄바꿈
    const words = title.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (ctx.measureText(test).width > maxTextW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);

    const lineH = fontPx * 1.2;
    const blockH = lines.length * lineH;
    const cy = H / 2;
    const padX = fontPx * 0.6;
    const padY = fontPx * 0.5;
    const boxW = Math.min(W * 0.92, maxTextW + padX * 2);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect((W - boxW) / 2, cy - blockH / 2 - padY, boxW, blockH + padY * 2);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = fontPx * 0.15;
    lines.forEach((ln, i) => ctx.fillText(ln, W / 2, cy - blockH / 2 + lineH * (i + 0.5), maxTextW));
  }
  return canvas.toDataURL("image/png");
}
