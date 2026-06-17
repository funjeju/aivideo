"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { TEMPLATE_SAMPLES, VOICE_SAMPLES, TemplateSample } from "@/lib/landing-samples";

export default function Landing() {
  const t = useTranslations("landing");
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const { user, loading } = useAuth();

  const [sel, setSel] = useState<TemplateSample | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  function goStart() {
    router.push(user ? `/${locale}/create` : `/${locale}/auth/signin`);
  }

  function playVoice(url: string) {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.src = url;
    a.load();
    a.play().catch(() => {});
  }

  return (
    <div className="flex-1">
      {/* HERO */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-20 text-center">
        <span className="inline-block text-xs font-medium text-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 rounded-full mb-6">
          {t("heroBadge")}
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold text-[var(--ink)] leading-tight tracking-tight mb-5">
          {t("heroTitle")}
        </h1>
        <p className="text-lg text-[var(--ink-soft)] max-w-2xl mx-auto mb-9 leading-relaxed">
          {t("heroSubtitle")}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => (user ? router.push(`/${locale}/dashboard`) : goStart())}
            className="px-7 py-3.5 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            {!loading && user ? t("heroCtaDashboard") : t("heroCtaPrimary")}
          </button>
          <a
            href="#how"
            className="px-7 py-3.5 rounded-[var(--radius)] border border-[var(--line)] text-[var(--ink)] text-sm font-semibold hover:bg-[var(--paper-sunken)] transition-colors"
          >
            {t("heroCtaSecondary")}
          </a>
        </div>

        {/* 스펙 칩 — 사실 기반 신뢰 요소 */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-9">
          {[t("spec1"), t("spec2"), t("spec3"), t("spec4"), t("spec5")].map((s) => (
            <span key={s} className="text-xs text-[var(--ink-soft)] border border-[var(--line)] rounded-full px-3 py-1">
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* 작동 방식 */}
      <section id="how" className="bg-[var(--paper-raised)] border-y border-[var(--line)] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-semibold text-[var(--ink)] mb-2">{t("howTitle")}</h2>
            <p className="text-sm text-[var(--ink-soft)]">{t("howSubtitle")}</p>
          </div>

          {/* 3단계 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-10">
            {[
              { n: "1", title: t("step1Title"), desc: t("step1Desc") },
              { n: "2", title: t("step2Title"), desc: t("step2Desc") },
              { n: "3", title: t("step3Title"), desc: t("step3Desc") },
            ].map((step, i, arr) => (
              <div key={step.n} className="relative text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center text-lg font-bold">
                  {step.n}
                </div>
                <h3 className="font-medium text-[var(--ink)] mb-2">{step.title}</h3>
                <p className="text-sm text-[var(--ink-soft)] leading-relaxed">{step.desc}</p>
                {i < arr.length - 1 && (
                  <span className="hidden sm:block absolute top-6 -right-4 text-[var(--ink-faint)]">→</span>
                )}
              </div>
            ))}
          </div>

          {/* 혜택 — 필요 없는 것들 */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="text-[var(--ink-faint)]">{t("benefitLabel")}:</span>
            {[t("benefit1"), t("benefit2"), t("benefit3")].map((b) => (
              <span key={b} className="px-3 py-1 rounded-full bg-[var(--paper-sunken)] text-[var(--ink-soft)] line-through decoration-[var(--accent)]/60">
                {b}
              </span>
            ))}
            <span className="font-semibold text-[var(--accent)]">{t("benefitTail")}</span>
          </div>
        </div>
      </section>

      {/* 기능 */}
      <section id="features" className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-semibold text-[var(--ink)] mb-2">{t("featuresTitle")}</h2>
            <p className="text-sm text-[var(--ink-soft)]">{t("featuresSubtitle")}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: "🎯", title: t("feat1Title"), desc: t("feat1Desc") },
              { icon: "🎨", title: t("feat2Title"), desc: t("feat2Desc") },
              { icon: "✂️", title: t("feat3Title"), desc: t("feat3Desc") },
              { icon: "🏢", title: t("feat4Title"), desc: t("feat4Desc") },
            ].map((f) => (
              <div key={f.title} className="flex gap-4 p-5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper-raised)]">
                <span className="text-2xl leading-none">{f.icon}</span>
                <div>
                  <h3 className="font-medium text-[var(--ink)] mb-1">{f.title}</h3>
                  <p className="text-sm text-[var(--ink-soft)] leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 템플릿 갤러리 */}
      <section id="templates" className="bg-[var(--paper-raised)] border-y border-[var(--line)] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-semibold text-[var(--ink)] mb-2">{t("galleryTitle")}</h2>
            <p className="text-sm text-[var(--ink-soft)]">{t("gallerySubtitle")}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {TEMPLATE_SAMPLES.map((tpl) => (
              <button
                key={tpl.id}
                onClick={() => setSel(tpl)}
                className="group rounded-[var(--radius)] border border-[var(--line)] overflow-hidden text-left hover:shadow-[var(--shadow-md)] hover:border-[var(--accent)] transition-all"
              >
                <div className="aspect-[3/4] bg-[var(--paper-sunken)] overflow-hidden relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tpl.poster} alt={tpl.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <span className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/55 text-white flex items-center justify-center text-xs">▶</span>
                </div>
                <div className="p-2.5">
                  <p className="text-sm font-medium text-[var(--ink)] truncate">{tpl.name}</p>
                  <p className="text-xs text-[var(--ink-soft)] line-clamp-1">{tpl.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 목소리 샘플 */}
      <section id="voices" className="py-20">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-[var(--ink)] mb-2">{t("voicesTitle")}</h2>
            <p className="text-sm text-[var(--ink-soft)]">{t("voicesSubtitle")}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {VOICE_SAMPLES.map((v) => (
              <button
                key={v.id}
                onClick={() => playVoice(v.preview)}
                className="flex items-center justify-between p-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] hover:border-[var(--accent)] transition-colors"
              >
                <span className="text-sm text-[var(--ink)]">{v.name}</span>
                <span className="w-7 h-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center text-xs">▶</span>
              </button>
            ))}
          </div>
          <audio ref={audioRef} className="hidden" />
        </div>
      </section>

      {/* 활용 사례 */}
      <section className="bg-[var(--paper-raised)] border-y border-[var(--line)] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-semibold text-[var(--ink)] mb-2">{t("useTitle")}</h2>
            <p className="text-sm text-[var(--ink-soft)]">{t("useSubtitle")}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: "📺", title: t("use1Title"), desc: t("use1Desc") },
              { icon: "🏪", title: t("use2Title"), desc: t("use2Desc") },
              { icon: "🎓", title: t("use3Title"), desc: t("use3Desc") },
            ].map((u) => (
              <div key={u.title} className="p-5 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] text-center">
                <div className="text-3xl mb-3">{u.icon}</div>
                <h3 className="font-medium text-[var(--ink)] mb-1">{u.title}</h3>
                <p className="text-sm text-[var(--ink-soft)] leading-relaxed">{u.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 하단 CTA */}
      <section className="bg-[var(--paper-sunken)] py-20">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-semibold text-[var(--ink)] mb-2">{t("ctaTitle")}</h2>
          <p className="text-sm text-[var(--ink-soft)] mb-7">{t("ctaSubtitle")}</p>
          <button
            onClick={goStart}
            className="px-7 py-3.5 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            {t("ctaButton")}
          </button>
        </div>
      </section>

      {/* 템플릿 미리보기 모달 */}
      {sel && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setSel(null)}
        >
          <div
            className="bg-[var(--paper)] rounded-[var(--radius)] overflow-hidden max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">{sel.name}</p>
                <p className="text-xs text-[var(--ink-soft)]">{sel.desc}</p>
              </div>
              <button onClick={() => setSel(null)} className="text-[var(--ink-faint)] hover:text-[var(--ink)] text-xl leading-none px-1">×</button>
            </div>
            {/* 영상: youtubeId 있으면 임베드(클릭 시에만 로드=트래픽0), 없으면 포스터+곧공개 */}
            {sel.youtubeId ? (
              <div className="aspect-[9/16] bg-black">
                <iframe
                  src={`https://www.youtube.com/embed/${sel.youtubeId}`}
                  title={sel.name}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                />
              </div>
            ) : (
              <div className="relative aspect-[3/4] bg-[var(--paper-sunken)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sel.poster} alt={sel.name} className="w-full h-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="px-3 py-1.5 rounded-full bg-black/60 text-white text-xs">{t("comingSoon")}</span>
                </span>
              </div>
            )}
            <div className="p-4">
              <button
                onClick={goStart}
                className="w-full py-3 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                {t("heroCtaPrimary")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
