"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, userDoc, loading } = useAuth();
  const t = useTranslations("admin");
  const params = useParams();
  const router = useRouter();
  const locale = params.locale as string;

  useEffect(() => {
    if (loading) return;
    if (!user) router.push(`/${locale}/auth/signin`);
  }, [loading, user, locale, router]);

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (!user) return null;

  const role = userDoc?.role;
  if (role !== "staff" && role !== "superadmin") {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-[var(--ink-soft)]">{t("unauthorized")}</p>
      </main>
    );
  }

  return (
    <div className="flex flex-1">
      <aside className="w-56 border-r border-[var(--line)] p-4 flex flex-col gap-1">
        <AdminNav locale={locale} t={t} />
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

function AdminNav({ locale, t }: { locale: string; t: ReturnType<typeof useTranslations> }) {
  const navItems = [
    { href: `/${locale}/admin`, label: t("title") },
    { href: `/${locale}/admin/members`, label: t("members") },
    { href: `/${locale}/admin/insights`, label: "인사이트 DB" },
    { href: `/${locale}/admin/logs`, label: "생성 로그" },
    { href: `/${locale}/admin/templates`, label: t("templates") },
    { href: `/${locale}/admin/styles`, label: "화풍 관리" },
    { href: `/${locale}/admin/videos`, label: t("videos") },
    { href: `/${locale}/admin/voices`, label: t("voices") },
    { href: `/${locale}/admin/brush`, label: "붓 테스트" },
    { href: `/${locale}/admin/cinemagraph`, label: "시네마그래프" },
    { href: `/${locale}/admin/emoticon`, label: "이모티콘 테스트" },
    { href: `/${locale}/admin/corporate`, label: "업체용 테스트" },
    { href: `/${locale}/admin/outro`, label: "아웃트로" },
    { href: `/${locale}/admin/billing`, label: t("billing") },
    { href: `/${locale}/admin/settings`, label: t("settings") },
  ];

  return (
    <>
      <p className="text-xs font-semibold text-[var(--ink-faint)] uppercase tracking-wider mb-2 px-2">
        Admin
      </p>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="px-3 py-2 rounded-lg text-sm text-[var(--ink-soft)] hover:bg-[var(--paper-sunken)] hover:text-[var(--ink)] transition-colors"
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}
