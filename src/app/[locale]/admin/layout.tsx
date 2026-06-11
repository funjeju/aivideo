import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionRole, isAdmin } from "@/lib/auth";
import { getTranslations } from "next-intl/server";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const cookieStore = await cookies();
  const idToken = cookieStore.get("__session")?.value;

  if (!idToken) {
    redirect(`/${locale}/auth/signin`);
  }

  const role = await getSessionRole(idToken);
  if (!isAdmin(role)) {
    const t = await getTranslations({ locale, namespace: "admin" });
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-[var(--ink-soft)]">{t("unauthorized")}</p>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-[var(--line)] p-4 flex flex-col gap-1">
        <AdminNav locale={locale} />
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

function AdminNav({ locale }: { locale: string }) {
  const navItems = [
    { href: `/${locale}/admin`, label: "대시보드" },
    { href: `/${locale}/admin/members`, label: "회원 관리" },
    { href: `/${locale}/admin/templates`, label: "템플릿 관리" },
    { href: `/${locale}/admin/videos`, label: "영상 관리" },
    { href: `/${locale}/admin/voices`, label: "보이스 관리" },
    { href: `/${locale}/admin/billing`, label: "비용·매출" },
    { href: `/${locale}/admin/settings`, label: "시스템 설정" },
  ];

  return (
    <>
      <p className="text-xs font-semibold text-[var(--ink-faint)] uppercase tracking-wider mb-2 px-2">Admin</p>
      {navItems.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="px-3 py-2 rounded-lg text-sm text-[var(--ink-soft)] hover:bg-[var(--paper-sunken)] hover:text-[var(--ink)] transition-colors"
        >
          {item.label}
        </a>
      ))}
    </>
  );
}
