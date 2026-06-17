"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";

interface Tier {
  id: string;
  name: string;
  price: number; // 월 원
  desc: string;
  features: string[];
  highlight?: boolean;
}

const TIERS: Tier[] = [
  {
    id: "free", name: "무료", price: 0, desc: "가볍게 체험",
    features: ["1분 영상 2편 체험", "워터마크 포함", "장면 수정 불가"],
  },
  {
    id: "tier1", name: "Lite", price: 9900, desc: "취미·입문",
    features: ["월 10크레딧 (영상 10분 분량)", "최대 5분", "워터마크 제거", "장면 수정"],
  },
  {
    id: "tier2", name: "Pro", price: 29000, desc: "크리에이터", highlight: true,
    features: ["월 35크레딧 (영상 35분 분량)", "최대 10분", "동시 제작 3편 + 우선 처리", "업소 홍보영상(사진→화풍)"],
  },
  {
    id: "tier3", name: "VIP", price: 99000, desc: "비즈니스·팀",
    features: ["월 130크레딧 (영상 130분 분량)", "최대 10분", "동시 제작 5편 + 최우선", "업소용 사진 다수", "(향후) API·대량"],
  },
];

const won = (n: number) => n.toLocaleString("ko-KR");

export default function PricingPage() {
  const { user, userDoc } = useAuth();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  // 현재 활성 구독 티어(없거나 만료/해지+기간경과면 없음)
  const sub = userDoc?.subscription;
  const activeTier = sub && (sub.status === "active" || (sub.status === "canceled" && sub.currentPeriodEnd > Date.now()))
    ? sub.tier : null;

  const [modalTier, setModalTier] = useState<Tier | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  function openReserve(t: Tier) {
    setErr(""); setDone(false);
    setEmail(""); // 자동 채움 X — 사용자가 직접 입력하게(흐린 예시만)
    setModalTier(t);
  }

  async function submit() {
    if (!modalTier) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, tier: modalTier.id, uid: user?.uid }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "신청 실패"); return; }
      setDone(true);
    } catch {
      setErr("오류가 발생했습니다");
    } finally { setBusy(false); }
  }

  return (
    <main className="flex-1 px-6 py-16 max-w-5xl mx-auto w-full">
      <div className="text-center mb-4">
        <h1 className="text-3xl font-bold text-[var(--ink)] mb-2">요금제</h1>
        <p className="text-sm text-[var(--ink-soft)]">주제만 입력하면 그림으로 설명하는 영상이 자동으로.</p>
      </div>

      {/* 상단 배너 — 구독 중이면 내 구독 관리, 아니면 사전예약 */}
      <div className="text-center mb-10">
        {activeTier ? (
          <button
            onClick={() => router.push(`/${locale}/billing`)}
            className="inline-block text-sm font-medium text-[var(--accent)] bg-[var(--accent-soft)] rounded-full px-4 py-2 hover:opacity-90"
          >
            ✓ 현재 <b>{TIERS.find((t) => t.id === activeTier)?.name ?? activeTier}</b> 이용 중 — 내 구독 관리 →
          </button>
        ) : (
          <span className="inline-block text-sm font-medium text-[var(--accent)] bg-[var(--accent-soft)] rounded-full px-4 py-2">
            🎁 <b>2주 한정 얼리버드</b> — 이메일 신청 시 출시할 때 <b>20% 할인</b>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {TIERS.map((t) => {
          const discounted = Math.round((t.price * 0.8) / 10) * 10;
          return (
            <div
              key={t.id}
              className={`rounded-[var(--radius)] border p-5 flex flex-col ${t.highlight ? "border-[var(--accent)] ring-2 ring-[var(--accent)] bg-[var(--paper-raised)]" : "border-[var(--line)]"}`}
            >
              {t.highlight && <span className="text-[11px] font-semibold text-[var(--accent)] mb-1">인기</span>}
              <h2 className="text-lg font-semibold text-[var(--ink)]">{t.name}</h2>
              <p className="text-xs text-[var(--ink-soft)] mb-3">{t.desc}</p>

              {t.price === 0 ? (
                <p className="text-2xl font-bold text-[var(--ink)] mb-4">무료</p>
              ) : (
                <div className="mb-4">
                  <p className="text-xs text-[var(--ink-faint)] line-through">월 {won(t.price)}원</p>
                  <p className="text-2xl font-bold text-[var(--ink)]">{won(discounted)}원<span className="text-sm font-normal text-[var(--ink-soft)]">/월</span></p>
                  <p className="text-[11px] text-[var(--accent)]">얼리버드 20% 할인가</p>
                </div>
              )}

              <ul className="flex flex-col gap-1.5 text-sm text-[var(--ink-soft)] mb-5 flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-1.5"><span className="text-[var(--accent)]">·</span>{f}</li>
                ))}
              </ul>

              {activeTier === t.id ? (
                <button
                  onClick={() => router.push(`/${locale}/billing`)}
                  className="w-full py-2.5 rounded-[var(--radius)] bg-[var(--paper-sunken)] text-[var(--ink-soft)] text-sm font-semibold"
                >
                  ✓ 이용 중 — 관리
                </button>
              ) : t.id === "free" ? (
                <button
                  onClick={() => router.push(user ? `/${locale}/create` : `/${locale}/auth/signin`)}
                  className="w-full py-2.5 rounded-[var(--radius)] border border-[var(--line)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--paper-sunken)]"
                >
                  무료로 시작
                </button>
              ) : (
                <button
                  onClick={() => openReserve(t)}
                  className={`w-full py-2.5 rounded-[var(--radius)] text-sm font-semibold ${t.highlight ? "bg-[var(--accent)] text-white hover:opacity-90" : "border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-soft)]"}`}
                >
                  얼리버드 신청 (20% 할인)
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-[var(--ink-soft)] mt-8">
        <b>1 크레딧 = 영상 1분.</b> (2분 영상이면 2크레딧 차감)
      </p>
      <p className="text-center text-xs text-[var(--ink-faint)] mt-2">
        얼리버드는 <b>결제가 아니에요.</b> 2주 한정으로 신청하면 출시 시 20% 할인 안내를 보내드리며, 언제든 취소할 수 있어요.
      </p>

      {/* 사전예약 모달 */}
      {modalTier && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setModalTier(null)}>
          <div className="bg-[var(--paper)] rounded-[var(--radius)] w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            {done ? (
              <>
                <h3 className="text-lg font-semibold text-[var(--ink)] mb-2">신청 완료 🎉</h3>
                <p className="text-sm text-[var(--ink-soft)] mb-5">출시되면 <b>{modalTier.name} 20% 할인</b> 안내를 메일로 보내드릴게요. 그동안 무료로 만들어보세요!</p>
                <button onClick={() => setModalTier(null)} className="w-full py-2.5 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-medium">닫기</button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-[var(--ink)] mb-1">{modalTier.name} 얼리버드 신청</h3>
                <p className="text-xs text-[var(--ink-soft)] mb-4">2주 한정 — 출시 시 <b>20% 할인</b>. 결제 아님, 안내받을 이메일만 남겨주세요.</p>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="예: 123@123.com"
                  className="w-full px-3 py-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper-sunken)] text-sm text-[var(--ink)] mb-3"
                />
                {err && <p className="text-xs text-[var(--accent)] mb-2">{err}</p>}
                <button onClick={submit} disabled={busy} className="w-full py-2.5 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-50">
                  {busy ? "신청 중..." : "20% 할인 얼리버드 신청"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
