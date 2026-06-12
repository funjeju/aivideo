"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

interface CostBreakdown {
  llm: number;
  tts: number;
  image: number;
  render: number;
  total: number;
  videoCount: number;
}

export default function AdminBillingPage() {
  const [c, setC] = useState<CostBreakdown | null>(null);

  useEffect(() => {
    (async () => {
      const [projectsSnap, jobsSnap] = await Promise.all([
        getDocs(collection(db, "projects")),
        getDocs(collection(db, "renderJobs")),
      ]);

      let llm = 0, tts = 0, image = 0, render = 0, videoCount = 0;
      projectsSnap.forEach((d) => {
        const p = d.data() as { status?: string; costLog?: { llmCostUsd?: number; ttsCostUsd?: number; imageCostUsd?: number } };
        llm += p.costLog?.llmCostUsd ?? 0;
        tts += p.costLog?.ttsCostUsd ?? 0;
        image += p.costLog?.imageCostUsd ?? 0;
        if (p.status === "done") videoCount++;
      });
      jobsSnap.forEach((d) => {
        const j = d.data() as { costLog?: { renderCostUsd?: number } };
        render += j.costLog?.renderCostUsd ?? 0;
      });

      const total = llm + tts + image + render;
      setC({ llm, tts, image, render, total, videoCount });
    })().catch((e) => { console.error(e); setC({ llm: 0, tts: 0, image: 0, render: 0, total: 0, videoCount: 0 }); });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--ink)] mb-6">비용·매출</h1>
      {!c ? (
        <div className="h-40 rounded-[var(--radius)] bg-[var(--paper-sunken)] animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <CostCard label="LLM (원고)" value={c.llm} />
            <CostCard label="TTS (음성)" value={c.tts} />
            <CostCard label="이미지" value={c.image} />
            <CostCard label="렌더링" value={c.render} />
          </div>
          <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-[var(--radius)] p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--ink-faint)]">총 외부 API 원가</p>
              <p className="text-3xl font-semibold text-[var(--ink)] tabular-nums">${c.total.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[var(--ink-faint)]">완성 영상 / 편당 평균</p>
              <p className="text-lg font-medium text-[var(--ink-soft)] tabular-nums">
                {c.videoCount}편 / ${c.videoCount > 0 ? (c.total / c.videoCount).toFixed(2) : "0.00"}
              </p>
            </div>
          </div>
          <p className="text-xs text-[var(--ink-faint)] mt-4">
            이미지가 원가의 80~90%를 차지합니다. 비용 최적화의 핵심 레버는 이미지 생성 전략입니다.
          </p>
        </>
      )}
    </div>
  );
}

function CostCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-[var(--radius)] p-4">
      <p className="text-xs text-[var(--ink-faint)] mb-1">{label}</p>
      <p className="text-xl font-semibold text-[var(--ink)] tabular-nums">${value.toFixed(2)}</p>
    </div>
  );
}
