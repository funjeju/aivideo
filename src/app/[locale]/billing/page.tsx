"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { getTier } from "@/lib/pricing";
import { getIdToken } from "@/lib/clientAuth";

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

export default function MyBillingPage() {
  const { user, userDoc, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (loading) return <main className="flex-1 px-6 py-16 max-w-2xl mx-auto w-full text-center text-[var(--ink-soft)]">불러오는 중…</main>;
  if (!user) {
    if (typeof window !== "undefined") router.push(`/${locale}/auth/signin`);
    return null;
  }

  const sub = userDoc?.subscription;
  const credits = userDoc?.credits ?? 0;
  const active = sub && (sub.status === "active" || (sub.status === "canceled" && sub.currentPeriodEnd > Date.now()));
  const tier = getTier(active ? sub?.tier : "free");

  async function cancel() {
    if (!confirm("구독을 해지할까요? 현재 결제 주기가 끝날 때까지는 이용할 수 있어요.")) return;
    setBusy(true); setMsg("");
    try {
      const token = await getIdToken();
      const res = await fetch("/api/billing/cancel", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { setMsg("해지 처리에 실패했어요. 잠시 후 다시 시도해주세요."); return; }
      setMsg("해지되었습니다. 현재 주기까지 이용 가능하며, 다음 결제는 진행되지 않아요.");
    } finally { setBusy(false); }
  }

  return (
    <main className="flex-1 px-6 py-16 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl font-bold text-[var(--ink)] mb-6">내 구독 · 요금제</h1>

      {/* 현재 플랜 */}
      <div className="rounded-[var(--radius)] border border-[var(--line)] p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-[var(--ink-soft)] mb-0.5">현재 플랜</p>
            <p className="text-xl font-bold text-[var(--ink)]">{tier.name}</p>
          </div>
          {active && sub && (
            <span className={`text-xs px-2.5 py-1 rounded-full ${sub.status === "active" ? "bg-green-100 text-green-700" : "bg-[var(--paper-sunken)] text-[var(--ink-soft)]"}`}>
              {sub.status === "active" ? "이용 중" : "해지 예정"}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between py-3 border-t border-[var(--line)]">
          <span className="text-sm text-[var(--ink-soft)]">보유 크레딧</span>
          <span className="text-lg font-semibold text-[var(--ink)] tabular-nums">{credits.toLocaleString("ko-KR")}</span>
        </div>

        {active && sub && (
          <div className="flex items-center justify-between py-3 border-t border-[var(--line)]">
            <span className="text-sm text-[var(--ink-soft)]">{sub.status === "active" ? "다음 결제일" : "이용 종료일"}</span>
            <span className="text-sm text-[var(--ink)]">{fmtDate(sub.currentPeriodEnd)}</span>
          </div>
        )}
      </div>

      {msg && <p className="text-sm text-[var(--accent)] mb-4">{msg}</p>}

      {/* 액션 */}
      {active && sub?.status === "active" ? (
        <div className="flex gap-3">
          <button
            onClick={() => router.push(`/${locale}/billing/checkout`)}
            className="flex-1 py-2.5 rounded-[var(--radius)] border border-[var(--accent)] text-[var(--accent)] text-sm font-semibold hover:bg-[var(--accent-soft)]"
          >
            플랜 변경
          </button>
          <button
            onClick={cancel}
            disabled={busy}
            className="flex-1 py-2.5 rounded-[var(--radius)] border border-[var(--line)] text-[var(--ink-soft)] text-sm font-medium hover:bg-[var(--paper-sunken)] disabled:opacity-50"
          >
            {busy ? "처리 중…" : "구독 해지"}
          </button>
        </div>
      ) : (
        <button
          onClick={() => router.push(`/${locale}/billing/checkout`)}
          className="w-full py-3 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90"
        >
          {active ? "다시 구독하기" : "구독하기"}
        </button>
      )}

      <p className="text-xs text-[var(--ink-faint)] text-center mt-6">
        크레딧으로 영상을 만들 수 있어요. 매월 결제일에 포함 크레딧이 충전됩니다.
      </p>
    </main>
  );
}
