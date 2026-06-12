"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { ProjectDoc, RenderJobDoc } from "@/lib/types";

interface Stats {
  members: number;
  projects: number;
  videosDone: number;
  rendering: number;
  totalCostUsd: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [usersSnap, projectsSnap, jobsSnap] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "projects")),
          getDocs(collection(db, "renderJobs")),
        ]);

        let totalCostUsd = 0;
        let videosDone = 0;
        projectsSnap.forEach((d) => {
          const p = d.data() as ProjectDoc & { costLog?: { imageCostUsd?: number; llmCostUsd?: number; ttsCostUsd?: number } };
          if (p.status === "done") videosDone++;
          totalCostUsd += (p.costLog?.imageCostUsd ?? 0) + (p.costLog?.llmCostUsd ?? 0) + (p.costLog?.ttsCostUsd ?? 0);
        });

        let rendering = 0;
        jobsSnap.forEach((d) => {
          const j = d.data() as RenderJobDoc;
          if (j.status === "running" || j.status === "queued") rendering++;
          totalCostUsd += j.costLog?.renderCostUsd ?? 0;
        });

        setStats({
          members: usersSnap.size,
          projects: projectsSnap.size,
          videosDone,
          rendering,
          totalCostUsd,
        });
      } catch (e) {
        console.error("admin stats failed:", e);
        setStats({ members: 0, projects: 0, videosDone: 0, rendering: 0, totalCostUsd: 0 });
      }
    })();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--ink)] mb-6">대시보드</h1>
      {!stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 rounded-[var(--radius)] bg-[var(--paper-sunken)] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="총 회원" value={stats.members} />
          <StatCard label="총 프로젝트" value={stats.projects} />
          <StatCard label="완성 영상" value={stats.videosDone} />
          <StatCard label="진행 중 렌더" value={stats.rendering} />
          <StatCard label="누적 API 원가" value={`$${stats.totalCostUsd.toFixed(2)}`} />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-[var(--radius)] p-4">
      <p className="text-xs text-[var(--ink-faint)] mb-1">{label}</p>
      <p className="text-2xl font-semibold text-[var(--ink)] tabular-nums">{value}</p>
    </div>
  );
}
