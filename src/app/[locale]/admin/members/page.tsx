"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { UserDoc, UserRole } from "@/lib/types";
import { useAuth } from "@/components/providers/AuthProvider";

interface MemberRow extends UserDoc {
  id: string;
}

const ROLE_LABEL: Record<UserRole, string> = {
  user: "일반",
  staff: "스태프",
  superadmin: "슈퍼관리자",
};

export default function AdminMembersPage() {
  const { userDoc } = useAuth();
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const isSuperAdmin = userDoc?.role === "superadmin";

  async function load() {
    try {
      const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MemberRow)));
    } catch {
      // createdAt 없는 문서 섞이면 orderBy 실패 가능 → 정렬 없이 재시도
      const snap = await getDocs(collection(db, "users"));
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MemberRow)));
    }
  }

  useEffect(() => { load(); }, []);

  async function adminAction(body: object, label: string) {
    setBusy(label);
    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json();
        alert("실패: " + (e.error ?? res.status));
      } else {
        await load();
      }
    } finally {
      setBusy(null);
    }
  }

  function adjustCredits(m: MemberRow) {
    const input = prompt(`${m.email} 크레딧 조정 (증감값, 예: 100 또는 -50)`, "100");
    if (input === null) return;
    const delta = Number(input);
    if (isNaN(delta)) return;
    adminAction({ action: "adjustCredits", userId: m.id, delta }, m.id);
  }

  function changeRole(m: MemberRow) {
    const next = prompt(`${m.email} 역할 변경 (user / staff / superadmin)`, m.role);
    if (!next || !["user", "staff", "superadmin"].includes(next)) return;
    adminAction({ action: "setRole", userId: m.id, role: next }, m.id);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--ink)] mb-6">회원 관리</h1>
      {!members ? (
        <div className="h-40 rounded-[var(--radius)] bg-[var(--paper-sunken)] animate-pulse" />
      ) : members.length === 0 ? (
        <p className="text-[var(--ink-soft)]">회원이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto border border-[var(--line)] rounded-[var(--radius)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--paper-sunken)] text-left text-[var(--ink-soft)]">
                <th className="px-4 py-3 font-medium">이메일</th>
                <th className="px-4 py-3 font-medium">역할</th>
                <th className="px-4 py-3 font-medium">플랜</th>
                <th className="px-4 py-3 font-medium text-right">크레딧</th>
                {isSuperAdmin && <th className="px-4 py-3 font-medium text-right">관리</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-3 text-[var(--ink)]">{m.email || "(이메일 없음)"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${m.role === "superadmin" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : m.role === "staff" ? "bg-blue-100 text-blue-700" : "bg-[var(--paper-sunken)] text-[var(--ink-soft)]"}`}>
                      {ROLE_LABEL[m.role] ?? m.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">{m.plan ?? "-"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--ink)]">{m.credits ?? 0}</td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => adjustCredits(m)}
                        disabled={busy === m.id}
                        className="text-xs text-[var(--ink-soft)] hover:text-[var(--accent)] disabled:opacity-40 mr-3"
                      >
                        크레딧
                      </button>
                      <button
                        onClick={() => changeRole(m)}
                        disabled={busy === m.id}
                        className="text-xs text-[var(--ink-soft)] hover:text-[var(--accent)] disabled:opacity-40"
                      >
                        역할
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
