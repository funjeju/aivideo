"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { issueBillingKey, portoneClientConfigured, availableMethods, type PayMethod } from "@/lib/portone-client";
import { getIdToken } from "@/lib/clientAuth";

const METHOD_LABEL: Record<PayMethod, string> = { CARD: "신용/체크카드", KAKAOPAY: "카카오페이" };

const TIERS = [
  { id: "tier1", name: "Lite", price: 9900, desc: "월 크레딧 900 · 최대 5분" },
  { id: "tier2", name: "Pro", price: 29000, desc: "월 크레딧 3,150 · 10분 · 동시 3편", hot: true },
  { id: "tier3", name: "VIP", price: 99000, desc: "월 크레딧 11,700 · 10분 · 동시 5편" },
];

export default function CheckoutPage() {
  const { user, userDoc } = useAuth();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const methods = availableMethods();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<PayMethod>(methods[0] ?? "CARD");

  async function subscribe(tier: string) {
    if (!user) { router.push(`/${locale}/auth/signin`); return; }
    const phoneNumber = phone.replace(/[^0-9]/g, "");
    if (phoneNumber.length < 10) { setErr("휴대폰 번호를 입력해주세요 (빌링키 발급 필수)"); return; }
    setErr(""); setMsg(""); setBusy(tier);
    try {
      // 1) 결제수단 등록창 → 빌링키 발급
      const billingKey = await issueBillingKey(method, {
        customerId: user.uid,
        fullName: userDoc?.displayName || user.displayName || undefined,
        email: userDoc?.email || user.email || undefined,
        phoneNumber,
      });
      // 2) 서버에 첫 달 결제 + 구독 활성화 요청
      const token = await getIdToken();
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ billingKey, tier }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error === "payment_failed" ? `결제 실패: ${d.detail ?? ""}` : (d.error ?? "구독 실패")); return; }
      setMsg(`구독 완료! 크레딧 ${d.granted} 충전됨. 잠시 후 대시보드로 이동합니다.`);
      setTimeout(() => router.push(`/${locale}/dashboard`), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류가 발생했습니다");
    } finally { setBusy(null); }
  }

  return (
    <main className="flex-1 px-6 py-16 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-bold text-[var(--ink)] mb-1 text-center">구독 (테스트)</h1>
      <p className="text-sm text-[var(--ink-soft)] text-center mb-8">
        KG이니시스 <b>테스트 모드</b> — 실제 결제되지 않습니다. 테스트 카드로 진행하세요.
      </p>

      {!portoneClientConfigured() && (
        <p className="text-center text-sm text-[var(--accent)] mb-6">⚠️ 포트원 키 미설정 (env 확인 후 dev 재시작 필요)</p>
      )}
      {msg && <p className="text-center text-sm text-green-600 mb-6">{msg}</p>}
      {err && <p className="text-center text-sm text-[var(--accent)] mb-6">{err}</p>}

      <div className="max-w-xs mx-auto mb-8">
        <label className="block text-xs text-[var(--ink-soft)] mb-1">휴대폰 번호 <span className="text-[var(--accent)]">*</span></label>
        <input
          type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01012345678"
          className="w-full px-3 py-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper-sunken)] text-sm text-[var(--ink)] text-center"
        />
        <p className="text-[11px] text-[var(--ink-faint)] mt-1 text-center">결제수단 등록(빌링키) 발급에 필요해요.</p>

        {methods.length > 1 && (
          <div className="mt-4">
            <label className="block text-xs text-[var(--ink-soft)] mb-1">결제수단</label>
            <div className="flex gap-2">
              {methods.map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`flex-1 py-2 rounded-[var(--radius)] text-sm font-medium border ${method === m ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--ink-soft)]"}`}
                >
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TIERS.map((t) => (
          <div key={t.id} className={`rounded-[var(--radius)] border p-5 flex flex-col ${t.hot ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : "border-[var(--line)]"}`}>
            <h2 className="text-lg font-semibold text-[var(--ink)]">{t.name}</h2>
            <p className="text-xs text-[var(--ink-soft)] mb-3 flex-1">{t.desc}</p>
            <p className="text-2xl font-bold text-[var(--ink)] mb-4">{t.price.toLocaleString("ko-KR")}원<span className="text-sm font-normal text-[var(--ink-soft)]">/월</span></p>
            <button
              onClick={() => subscribe(t.id)}
              disabled={busy !== null}
              className={`w-full py-2.5 rounded-[var(--radius)] text-sm font-semibold disabled:opacity-50 ${t.hot ? "bg-[var(--accent)] text-white hover:opacity-90" : "border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-soft)]"}`}
            >
              {busy === t.id ? "처리 중..." : `${METHOD_LABEL[method]}로 구독`}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-8 text-xs text-[var(--ink-faint)] text-center leading-relaxed">
        <p className="font-medium text-[var(--ink-soft)] mb-1">KG이니시스 테스트 카드 예시</p>
        <p>카드번호 아무 유효형식(예: 4444-4444-4444-4444) · 유효기간 미래 · 비밀번호 앞2자리·생년월일·주민번호 임의</p>
        <p className="mt-1">실제 카드/실결제 아님. 결제창 안내대로 진행하면 됩니다.</p>
      </div>
    </main>
  );
}
