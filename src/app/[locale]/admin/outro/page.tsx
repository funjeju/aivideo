"use client";

import { useEffect, useState } from "react";

const VOICES = [
  { id: "nova", name: "Nova (따뜻한 여성)" },
  { id: "shimmer", name: "Shimmer (차분한 여성)" },
  { id: "coral", name: "Coral (밝은 여성)" },
  { id: "sage", name: "Sage (부드러운)" },
  { id: "echo", name: "Echo (낮은 남성)" },
  { id: "onyx", name: "Onyx (중후한 남성)" },
  { id: "ash", name: "Ash (담백한 남성)" },
];

interface Outro {
  enabled: boolean;
  brand: string;
  text: string;
  subtext: string;
  voiceId: string;
  audioUrl?: string;
}

const DEFAULTS: Outro = {
  enabled: true,
  brand: "Easyshorts",
  text: "다음 영상에서 또 만나요",
  subtext: "구독하고 더 많은 영상 보기",
  voiceId: "nova",
};

export default function OutroPage() {
  const [o, setO] = useState<Outro>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { getIdToken } = await import("@/lib/clientAuth");
        const token = await getIdToken();
        const res = await fetch("/api/admin/outro", { headers: { Authorization: `Bearer ${token}` } });
        const d = await res.json();
        if (d.outro) setO({ ...DEFAULTS, ...d.outro });
      } catch { /* 기본값 */ } finally { setLoading(false); }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      const res = await fetch("/api/admin/outro", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(o),
      });
      const d = await res.json();
      if (!res.ok) { setMsg(d.error ?? "저장 실패"); return; }
      setO({ ...DEFAULTS, ...d.outro });
      setMsg("저장됐습니다. 다음 렌더부터 영상 끝에 아웃트로가 붙습니다.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "오류");
    } finally { setSaving(false); }
  }

  if (loading) return <p className="text-sm text-[var(--ink-soft)]">불러오는 중…</p>;

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold text-[var(--ink)] mb-2">아웃트로 (영상 끝 브랜드 마무리)</h1>
      <p className="text-sm text-[var(--ink-soft)] mb-6">
        모든 영상 끝에 <b>2~3초 브랜드 아웃트로</b>가 자동으로 붙습니다. 멘트는 TTS 음성으로 함께 나옵니다.
        문구/음성을 바꾸면 음성을 다시 생성합니다.
      </p>

      <label className="flex items-center gap-2 text-sm text-[var(--ink)] mb-4 cursor-pointer">
        <input type="checkbox" checked={o.enabled} onChange={(e) => setO({ ...o, enabled: e.target.checked })} className="accent-[var(--accent)]" />
        아웃트로 사용
      </label>

      <div className="flex flex-col gap-3">
        <Field label="브랜드명 (크게 표시)">
          <input value={o.brand} onChange={(e) => setO({ ...o, brand: e.target.value })}
            className="w-full px-3 py-2 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm text-[var(--ink)]" />
        </Field>
        <Field label="멘트 (화면 + 음성으로 나옴)">
          <input value={o.text} onChange={(e) => setO({ ...o, text: e.target.value })}
            className="w-full px-3 py-2 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm text-[var(--ink)]" />
        </Field>
        <Field label="보조 문구 (작게, 화면만)">
          <input value={o.subtext} onChange={(e) => setO({ ...o, subtext: e.target.value })}
            className="w-full px-3 py-2 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm text-[var(--ink)]" />
        </Field>
        <Field label="음성">
          <select value={o.voiceId} onChange={(e) => setO({ ...o, voiceId: e.target.value })}
            className="px-2 py-1.5 rounded border border-[var(--line)] bg-[var(--paper-sunken)] text-sm">
            {VOICES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </Field>
      </div>

      <button onClick={save} disabled={saving}
        className="mt-5 px-5 py-2.5 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50">
        {saving ? "저장·음성 생성 중…" : "저장 (음성 생성)"}
      </button>
      {msg && <p className="text-sm text-[var(--ink-soft)] mt-3">{msg}</p>}

      {o.audioUrl && (
        <div className="mt-5">
          <p className="text-xs text-[var(--ink-soft)] mb-1">현재 아웃트로 음성</p>
          <audio src={o.audioUrl} controls className="w-full" />
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-[var(--ink-soft)]">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
