"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { ProjectDoc } from "@/lib/types";
import { formatLength } from "@/lib/length";

interface VideoRow extends ProjectDoc {
  id: string;
  outputUrl?: string;
  costLog?: { imageCostUsd?: number; llmCostUsd?: number; ttsCostUsd?: number };
}

const STATUS_LABEL: Record<string, string> = {
  draft: "초안", script_ready: "원고검토", approved: "생성대기",
  generating: "생성중", rendering: "렌더중", done: "완성", error: "오류",
};
const STYLE_LABEL: Record<string, string> = {
  whiteboard: "화이트보드", "ink-wash": "수묵담채", minhwa: "민화", "doodle-edu": "낙서 교육", "joseon-reaper": "조선 저승사자", "flat-icon": "플랫 아이콘", "retro-poster": "레트로 포스터", "dark-neon": "다크 네온", "3d-iso": "3D 아이소메트릭", "newspaper-cartoon": "신문 만평", "comic-essay": "만화책", "collage": "콜라주",
};

export default function AdminVideosPage() {
  const params = useParams();
  const locale = (params.locale as string) ?? "ko";
  const [rows, setRows] = useState<VideoRow[] | null>(null);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "projects"));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as VideoRow));
      list.sort((a, b) => {
        const at = (a.createdAt as { seconds?: number })?.seconds ?? 0;
        const bt = (b.createdAt as { seconds?: number })?.seconds ?? 0;
        return bt - at;
      });
      setRows(list);
    })().catch((e) => { console.error(e); setRows([]); });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--ink)] mb-6">영상 관리</h1>
      {!rows ? (
        <div className="h-40 rounded-[var(--radius)] bg-[var(--paper-sunken)] animate-pulse" />
      ) : rows.length === 0 ? (
        <p className="text-[var(--ink-soft)]">생성된 영상이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto border border-[var(--line)] rounded-[var(--radius)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--paper-sunken)] text-left text-[var(--ink-soft)]">
                <th className="px-4 py-3 font-medium">제목</th>
                <th className="px-4 py-3 font-medium">화풍</th>
                <th className="px-4 py-3 font-medium">길이</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium text-right">원가</th>
                <th className="px-4 py-3 font-medium text-right">영상</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const cost = (r.costLog?.imageCostUsd ?? 0) + (r.costLog?.llmCostUsd ?? 0) + (r.costLog?.ttsCostUsd ?? 0);
                return (
                  <tr key={r.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-4 py-3 max-w-xs truncate">
                      <Link href={`/${locale}/project/${r.id}`} className="text-[var(--ink)] hover:text-[var(--accent)] hover:underline">
                        {r.title || "(제목 없음)"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--ink-soft)]">{STYLE_LABEL[r.stylePackId] ?? r.stylePackId}</td>
                    <td className="px-4 py-3 text-[var(--ink-soft)]">{r.targetLength ? formatLength(r.targetLength) : "-"}</td>
                    <td className="px-4 py-3 text-[var(--ink-soft)]">{STATUS_LABEL[r.status] ?? r.status}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--ink)]">${cost.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      {r.outputUrl ? (
                        <a href={r.outputUrl} target="_blank" rel="noreferrer" className="text-xs text-[var(--accent)] hover:underline">재생</a>
                      ) : (
                        <span className="text-xs text-[var(--ink-faint)]">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
