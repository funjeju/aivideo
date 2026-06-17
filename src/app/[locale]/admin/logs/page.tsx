"use client";

import { Fragment, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { getIdToken } from "@/lib/clientAuth";

interface ProjRow {
  id: string; title: string; ownerEmail: string; status: string;
  targetLength: number | null; creditHold: number; creditSettled: boolean;
  creditRefunded: boolean; countedFree: boolean; updatedAt: number | null;
}
interface EventRow {
  id: string; step: string; status: string; message: string | null;
  meta: Record<string, unknown> | null; at: number | null;
}

const STATUS_COLOR: Record<string, string> = {
  done: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  rendering: "bg-blue-100 text-blue-700",
  generating: "bg-amber-100 text-amber-700",
};
const fmt = (ms: number | null) => ms ? new Date(ms).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";

export default function AdminLogsPage() {
  const { userDoc } = useAuth();
  const [rows, setRows] = useState<ProjRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loadingEv, setLoadingEv] = useState(false);

  const isSuper = userDoc?.role === "superadmin";

  async function load() {
    const token = await getIdToken();
    const res = await fetch("/api/admin/logs", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setRows((await res.json()).projects);
  }
  useEffect(() => { load(); }, []);

  async function toggle(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id); setEvents([]); setLoadingEv(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/logs?projectId=${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setEvents((await res.json()).events);
    } finally { setLoadingEv(false); }
  }

  if (!isSuper) return <div className="p-6 text-[var(--ink-soft)]">권한이 없습니다.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto w-full">
      <h1 className="text-xl font-semibold text-[var(--ink)] mb-1">생성 로그</h1>
      <p className="text-sm text-[var(--ink-soft)] mb-6">최근 프로젝트의 생성 단계·결과·크레딧 정황. 행을 누르면 단계별 타임라인이 펼쳐져요.</p>

      {!rows ? (
        <p className="text-sm text-[var(--ink-faint)]">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--ink-faint)]">기록이 없습니다.</p>
      ) : (
        <div className="rounded-[var(--radius)] border border-[var(--line)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--paper-sunken)] text-[var(--ink-soft)] text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">프로젝트</th>
                <th className="px-3 py-2 text-left font-medium">소유자</th>
                <th className="px-3 py-2 text-center font-medium">상태</th>
                <th className="px-3 py-2 text-center font-medium">크레딧</th>
                <th className="px-3 py-2 text-right font-medium">갱신</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr onClick={() => toggle(r.id)} className="border-t border-[var(--line)] cursor-pointer hover:bg-[var(--paper-sunken)]">
                    <td className="px-3 py-2 text-[var(--ink)]">{r.title}</td>
                    <td className="px-3 py-2 text-[var(--ink-soft)] text-xs">{r.ownerEmail}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[r.status] ?? "bg-[var(--paper-sunken)] text-[var(--ink-soft)]"}`}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      {r.creditHold > 0 ? (
                        <span className={r.creditRefunded ? "text-amber-600" : r.creditSettled ? "text-green-600" : "text-[var(--ink-soft)]"}>
                          {r.creditHold}{r.creditRefunded ? " 환불" : r.creditSettled ? " 확정" : " 보류"}
                        </span>
                      ) : r.countedFree ? <span className="text-[var(--ink-faint)]">무료</span> : "-"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-[var(--ink-faint)]">{fmt(r.updatedAt)}</td>
                  </tr>
                  {openId === r.id && (
                    <tr className="border-t border-[var(--line)] bg-[var(--paper-sunken)]">
                      <td colSpan={5} className="px-4 py-3">
                        {loadingEv ? <p className="text-xs text-[var(--ink-faint)]">불러오는 중…</p> : events.length === 0 ? (
                          <p className="text-xs text-[var(--ink-faint)]">이벤트 기록 없음(이 프로젝트 생성 전 로그 도입).</p>
                        ) : (
                          <ol className="space-y-1.5">
                            {events.map((e) => (
                              <li key={e.id} className="flex items-start gap-2 text-xs">
                                <span className="text-[var(--ink-faint)] tabular-nums shrink-0 w-24">{fmt(e.at)}</span>
                                <span className={`shrink-0 w-2 h-2 mt-1 rounded-full ${e.status === "error" ? "bg-red-500" : e.status === "ok" ? "bg-green-500" : "bg-[var(--ink-faint)]"}`} />
                                <span className="font-medium text-[var(--ink)] shrink-0 w-28">{e.step}</span>
                                <span className="text-[var(--ink-soft)]">{e.message}{e.meta ? ` ${JSON.stringify(e.meta)}` : ""}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
