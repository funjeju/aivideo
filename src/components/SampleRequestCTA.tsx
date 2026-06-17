"use client";

import { useState } from "react";

/**
 * 샘플 영상 신청 CTA (버튼 + 모달). 직접 만들기 부담스러운 사용자·업소용 리드 수집.
 * 어디든 드롭해 쓸 수 있게 버튼 스타일만 prop으로.
 */
export default function SampleRequestCTA({
  label = "샘플 영상 무료로 받기",
  kind = "general",
  className = "",
}: { label?: string; kind?: "general" | "corporate"; className?: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/sample-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, topic, contact, kind }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "신청 실패"); return; }
      setDone(true);
    } catch { setErr("오류가 발생했습니다"); }
    finally { setBusy(false); }
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setDone(false); setErr(""); }}
        className={className || "px-5 py-2.5 rounded-[var(--radius)] border border-[var(--accent)] text-[var(--accent)] text-sm font-medium hover:bg-[var(--accent-soft)] transition-colors"}
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-[var(--paper)] rounded-[var(--radius)] w-full max-w-sm p-6 text-left" onClick={(e) => e.stopPropagation()}>
            {done ? (
              <>
                <h3 className="text-lg font-semibold text-[var(--ink)] mb-2">신청 완료 🎬</h3>
                <p className="text-sm text-[var(--ink-soft)] mb-5">
                  주신 주제로 <b>샘플 영상</b>을 만들어 이메일로 보내드릴게요. 보통 1~2일 안에 도착해요!
                </p>
                <button onClick={() => setOpen(false)} className="w-full py-2.5 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-medium">닫기</button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-[var(--ink)] mb-1">샘플 영상 무료 신청</h3>
                <p className="text-xs text-[var(--ink-soft)] mb-4">
                  {kind === "corporate"
                    ? "가게·브랜드 정보만 주시면, 홍보 영상 샘플을 직접 만들어 보내드려요."
                    : "원하는 주제만 주시면, 샘플 영상을 직접 만들어 보내드려요. 직접 안 만드셔도 돼요."}
                </p>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일 (예: 123@123.com)"
                  className="w-full px-3 py-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper-sunken)] text-sm text-[var(--ink)] mb-2"
                />
                <textarea
                  value={topic} onChange={(e) => setTopic(e.target.value)} rows={3}
                  placeholder={kind === "corporate" ? "가게/브랜드명 + 알리고 싶은 내용 (예: OO카페, 시그니처 라떼 홍보)" : "원하는 주제 (예: 카페인이 몸에 미치는 영향)"}
                  className="w-full px-3 py-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper-sunken)] text-sm text-[var(--ink)] mb-2 resize-none"
                />
                <input
                  value={contact} onChange={(e) => setContact(e.target.value)} placeholder="연락처(선택)"
                  className="w-full px-3 py-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper-sunken)] text-sm text-[var(--ink)] mb-3"
                />
                {err && <p className="text-xs text-[var(--accent)] mb-2">{err}</p>}
                <button onClick={submit} disabled={busy} className="w-full py-2.5 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-semibold disabled:opacity-50">
                  {busy ? "신청 중..." : "무료 샘플 신청"}
                </button>
                <p className="text-[11px] text-[var(--ink-faint)] mt-2 text-center">결제 없음 · 부담 없이 받아보세요</p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
