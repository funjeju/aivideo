"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useRouter, useParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

export default function Header() {
  const { user, userDoc } = useAuth();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const t = useTranslations("landing");
  const locale = (params?.locale as string) ?? "ko";
  // 랜딩(루트)에서만 섹션 앵커 메뉴 노출
  const isLanding = pathname === `/${locale}` || pathname === `/${locale}/`;

  const anchors = [
    { href: "#how", label: t("navHow") },
    { href: "#features", label: t("navFeatures") },
    { href: "#templates", label: t("navGallery") },
    { href: "#voices", label: t("navVoices") },
  ];

  async function handleSignOut() {
    await signOut(auth);
    router.push(`/${locale}/auth/signin`);
  }

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-[var(--line)] bg-[var(--paper-raised)]/95 backdrop-blur flex items-center px-6">
      <Link href={`/${locale}`} className="flex items-center gap-2 mr-auto">
        <span className="w-8 h-8 rounded-lg bg-white overflow-hidden flex items-center justify-center shadow-[var(--shadow-sm)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://storage.googleapis.com/golpo-b6407.firebasestorage.app/brand/easyshorts-mark.png" alt="Easyshorts" className="w-full h-full object-cover" />
        </span>
        <span className="font-semibold text-[var(--ink)] tracking-tight">Easyshorts</span>
      </Link>
      {isLanding && (
        <nav className="hidden md:flex items-center gap-6 mr-6">
          {anchors.map((a) => (
            <a key={a.href} href={a.href} className="text-sm text-[var(--ink-soft)] hover:text-[var(--accent)] transition-colors">
              {a.label}
            </a>
          ))}
        </nav>
      )}
      {user ? (
        <div className="flex items-center gap-4">
          {userDoc?.role !== "user" && (
            <Link href={`/${locale}/admin`} className="text-sm text-[var(--ink-soft)] hover:text-[var(--ink)]">
              어드민
            </Link>
          )}
          <span className="text-sm text-[var(--ink-soft)]">{user.displayName ?? user.email}</span>
          <button
            onClick={handleSignOut}
            className="text-sm text-[var(--ink-faint)] hover:text-[var(--ink)]"
          >
            로그아웃
          </button>
        </div>
      ) : (
        <Link href={`/${locale}/auth/signin`} className="text-sm text-[var(--accent)]">
          로그인
        </Link>
      )}
    </header>
  );
}
