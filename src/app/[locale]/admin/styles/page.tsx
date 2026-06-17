"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { getIdToken } from "@/lib/clientAuth";

interface PackRow {
  id: string; name: string; emoji: string; sortOrder: number;
  defaultEnabled: boolean; override: boolean | null; visible: boolean; hasSample: boolean;
}

export default function AdminStylesPage() {
  const { userDoc } = useAuth();
  const [rows, setRows] = useState<PackRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const isSuper = userDoc?.role === "superadmin";

  async function load() {
    const token = await getIdToken();
    const res = await fetch("/api/admin/styles", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setRows((await res.json()).packs);
  }
  useEffect(() => { load(); }, []);

  async function toggle(id: string, enabled: boolean) {
    setBusy(id);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/admin/styles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, enabled }),
      });
      if (res.ok) await load();
    } finally { setBusy(null); }
  }

  if (!isSuper) return <div className="p-6 text-[var(--ink-soft)]">권한이 없습니다.</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-xl font-semibold text-[var(--ink)] mb-1">화풍 프리셋 관리</h1>
      <p className="text-sm text-[var(--ink-soft)] mb-6">
        생성 화면에 노출할 화풍을 켜고/끌 수 있어요. <b>노출중</b>이면 사용자 화풍 선택에 보이고, <b>숨김</b>이면 정의만 되어 있고 안 보여요.
        <br />갤러리(랜딩 템플릿)에 카드로 뜨려면 <b>샘플 이미지</b>가 필요해요.
      </p>

      {!rows ? <p className="text-sm text-[var(--ink-faint)]">불러오는 중…</p> : (
        <div className="rounded-[var(--radius)] border border-[var(--line)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--paper-sunken)] text-[var(--ink-soft)] text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">화풍</th>
                <th className="px-3 py-2 text-center font-medium">갤러리 샘플</th>
                <th className="px-3 py-2 text-center font-medium">노출</th>
                <th className="px-3 py-2 text-right font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--line)]">
                  <td className="px-3 py-2.5 text-[var(--ink)]">
                    {r.emoji} {r.name} <span className="text-[var(--ink-faint)] text-xs">· {r.id}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-xs">
                    {r.hasSample ? <span className="text-green-600">있음</span> : <span className="text-[var(--ink-faint)]">없음</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.visible ? "bg-green-100 text-green-700" : "bg-[var(--paper-sunken)] text-[var(--ink-faint)]"}`}>
                      {r.visible ? "노출중" : "숨김"}
                      {r.override !== null && <span className="ml-1 opacity-60">(수동)</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => toggle(r.id, !r.visible)}
                      disabled={busy === r.id}
                      className="text-xs text-[var(--ink-soft)] hover:text-[var(--accent)] disabled:opacity-40"
                    >
                      {busy === r.id ? "…" : r.visible ? "숨기기" : "노출"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[var(--ink-faint)] mt-4">
        새 화풍은 코드(<code>style-packs</code>)에 정의해두고 여기서 노출만 켜면 돼요. 갤러리 샘플 이미지는 별도 생성·업로드가 필요해요.
      </p>
    </div>
  );
}
