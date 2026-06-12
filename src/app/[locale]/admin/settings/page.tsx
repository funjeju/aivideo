"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";

export default function AdminSettingsPage() {
  const { userDoc } = useAuth();
  const [billingEnabled, setBillingEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const isSuper = userDoc?.role === "superadmin";

  useEffect(() => {
    (async () => {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      const res = await fetch("/api/admin/settings", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setBillingEnabled(data.billingEnabled ?? false);
    })().catch(() => setBillingEnabled(false));
  }, []);

  async function toggle() {
    if (!isSuper || billingEnabled === null) return;
    setSaving(true);
    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      const next = !billingEnabled;
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ billingEnabled: next }),
      });
      if (res.ok) setBillingEnabled(next);
      else alert("변경 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--ink)] mb-6">시스템 설정</h1>

      <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-[var(--radius)] p-5 max-w-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-[var(--ink)]">과금 적용</p>
            <p className="text-sm text-[var(--ink-soft)] mt-1">
              켜면 일반 사용자에게 크레딧 차감이 적용됩니다. 끄면 모두 무료로 이용합니다.
              <br />
              <span className="text-[var(--ink-faint)]">면제 계정(billingExempt)은 켜져 있어도 항상 무제한입니다.</span>
            </p>
          </div>
          <button
            onClick={toggle}
            disabled={!isSuper || saving || billingEnabled === null}
            className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
              billingEnabled ? "bg-[var(--accent)]" : "bg-[var(--line)]"
            }`}
            aria-pressed={!!billingEnabled}
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${
                billingEnabled ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
        <div className="mt-4 pt-4 border-t border-[var(--line)] text-sm">
          현재 상태:{" "}
          {billingEnabled === null ? (
            <span className="text-[var(--ink-faint)]">확인 중...</span>
          ) : billingEnabled ? (
            <span className="text-[var(--accent)] font-medium">과금 적용 중</span>
          ) : (
            <span className="text-green-600 font-medium">전체 무료 (과금 미적용)</span>
          )}
        </div>
        {!isSuper && (
          <p className="text-xs text-[var(--ink-faint)] mt-3">변경은 슈퍼관리자만 가능합니다.</p>
        )}
      </div>
    </div>
  );
}
