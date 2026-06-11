"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

export default function Header() {
  const { user, userDoc } = useAuth();
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) ?? "ko";

  async function handleSignOut() {
    await signOut(auth);
    router.push(`/${locale}/auth/signin`);
  }

  return (
    <header className="h-14 border-b border-[var(--line)] bg-[var(--paper-raised)] flex items-center px-6">
      <Link href={`/${locale}/dashboard`} className="font-semibold text-[var(--ink)] mr-auto">
        DrawNarrate
      </Link>
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
