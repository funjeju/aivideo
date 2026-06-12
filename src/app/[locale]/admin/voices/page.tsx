"use client";

import { useEffect, useRef, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { VoiceDoc } from "@/lib/types";

export default function AdminVoicesPage() {
  const [voices, setVoices] = useState<VoiceDoc[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  async function load() {
    try {
      const snap = await getDocs(query(collection(db, "voices"), orderBy("sortOrder")));
      setVoices(snap.docs.map((d) => d.data() as VoiceDoc));
    } catch {
      const snap = await getDocs(collection(db, "voices"));
      setVoices(snap.docs.map((d) => d.data() as VoiceDoc));
    }
  }
  useEffect(() => { load(); }, []);

  async function action(body: object, id: string) {
    setBusy(id);
    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      const res = await fetch("/api/admin/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) alert("실패");
      else await load();
    } finally {
      setBusy(null);
    }
  }

  function preview(id: string) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.src = `/api/voice-preview?voiceId=${id}&t=${Date.now()}`;
    audio.load();
    audio.play().catch(() => {});
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--ink)] mb-6">보이스 관리</h1>
      {!voices ? (
        <div className="h-40 rounded-[var(--radius)] bg-[var(--paper-sunken)] animate-pulse" />
      ) : voices.length === 0 ? (
        <p className="text-[var(--ink-soft)]">보이스가 없습니다. (scripts/seed-voices.mjs 실행)</p>
      ) : (
        <div className="overflow-x-auto border border-[var(--line)] rounded-[var(--radius)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--paper-sunken)] text-left text-[var(--ink-soft)]">
                <th className="px-4 py-3 font-medium">이름</th>
                <th className="px-4 py-3 font-medium">성별</th>
                <th className="px-4 py-3 font-medium">티어</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {voices.map((v) => (
                <tr key={v.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-3 text-[var(--ink)]">
                    <button onClick={() => preview(v.id)} className="mr-2 text-[var(--accent)]">▶</button>
                    {v.displayName}
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">
                    {v.gender === "female" ? "여성" : v.gender === "male" ? "남성" : "중립"}
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-soft)]">{v.tier === "premium" ? "프리미엄" : "무료"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${v.enabled ? "bg-green-100 text-green-700" : "bg-[var(--paper-sunken)] text-[var(--ink-faint)]"}`}>
                      {v.enabled ? "노출" : "숨김"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => action({ action: "toggleEnabled", voiceId: v.id }, v.id)}
                      disabled={busy === v.id}
                      className="text-xs text-[var(--ink-soft)] hover:text-[var(--accent)] disabled:opacity-40 mr-3"
                    >
                      {v.enabled ? "숨기기" : "노출"}
                    </button>
                    <button
                      onClick={() => action({ action: "setTier", voiceId: v.id, tier: v.tier === "premium" ? "free" : "premium" }, v.id)}
                      disabled={busy === v.id}
                      className="text-xs text-[var(--ink-soft)] hover:text-[var(--accent)] disabled:opacity-40"
                    >
                      {v.tier === "premium" ? "무료로" : "프리미엄으로"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
