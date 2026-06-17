"use client";

import { useState } from "react";
import { signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

export default function SignInPage() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleGoogle() {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.push(`/${locale}/dashboard`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push(`/${locale}/dashboard`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--paper)]">
      <div className="w-full max-w-sm bg-[var(--paper-raised)] rounded-[var(--radius)] p-8 shadow-[var(--shadow-md)]">
        <h1 className="text-2xl font-semibold text-[var(--ink)] mb-2 text-center">Easyshorts</h1>
        <p className="text-sm text-[var(--ink-soft)] text-center mb-8">지식을 영상으로 만드세요</p>

        <button
          onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-[var(--line)] rounded-[var(--radius)] text-sm font-medium text-[var(--ink)] hover:bg-[var(--paper-sunken)] transition-colors mb-4"
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
          </svg>
          {t("signInWithGoogle")}
        </button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--line)]" />
          </div>
          <div className="relative flex justify-center text-xs text-[var(--ink-faint)] bg-[var(--paper-raised)] px-2">또는</div>
        </div>

        <form onSubmit={handleEmail} className="flex flex-col gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("email")}
            className="w-full px-4 py-3 rounded-[var(--radius)] bg-[var(--paper-sunken)] border border-[var(--line)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none focus:border-[var(--accent)]"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("password")}
            className="w-full px-4 py-3 rounded-[var(--radius)] bg-[var(--paper-sunken)] border border-[var(--line)] text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:outline-none focus:border-[var(--accent)]"
            required
          />
          {error && <p className="text-xs text-[var(--accent)]">{error}</p>}
          <button
            type="submit"
            className="w-full py-3 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {t("signIn")}
          </button>
        </form>
      </div>
    </main>
  );
}
