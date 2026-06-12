"use client";

import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";

const SAMPLE_INK_WASH =
  "https://storage.googleapis.com/golpo-b6407.firebasestorage.app/_test/image-korean.png";

const STYLES = [
  {
    id: "whiteboard",
    name: "클래식 화이트보드",
    desc: "깔끔한 설명 영상의 기본기",
    emoji: "✏️",
    bg: "linear-gradient(135deg, #FFFFFF 0%, #F2EEE7 100%)",
  },
  {
    id: "ink-wash",
    name: "수묵담채",
    desc: "한지 위 먹선, 심리·철학·역사",
    emoji: "🖌️",
    image: SAMPLE_INK_WASH,
  },
  {
    id: "minhwa",
    name: "민화 / 조선",
    desc: "오방색 모티프, 한국사·문화",
    emoji: "🐯",
    bg: "linear-gradient(135deg, #FDF6E3 0%, #E8C9C7 100%)",
  },
];

export default function Landing() {
  const t = useTranslations("landing");
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const { user, loading } = useAuth();

  function goStart() {
    if (user) router.push(`/${locale}/create`);
    else router.push(`/${locale}/auth/signin`);
  }

  return (
    <div className="flex-1">
      {/* HERO */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-24 text-center">
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
          {!loading && user ? (
            <button
              onClick={() => router.push(`/${locale}/dashboard`)}
              className="px-7 py-3.5 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              {t("heroCtaDashboard")}
            </button>
          ) : (
            <button
              onClick={goStart}
              className="px-7 py-3.5 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              {t("heroCtaPrimary")}
            </button>
          )}
          <a
            href="#how"
            className="px-7 py-3.5 rounded-[var(--radius)] border border-[var(--line)] text-[var(--ink)] text-sm font-semibold hover:bg-[var(--paper-sunken)] transition-colors"
          >
            {t("heroCtaSecondary")}
          </a>
        </div>
      </section>

      {/* 화풍 미리보기 */}
      <section className="bg-[var(--paper-raised)] border-y border-[var(--line)] py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-semibold text-[var(--ink)] mb-2">{t("stylesTitle")}</h2>
            <p className="text-sm text-[var(--ink-soft)]">{t("stylesSubtitle")}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {STYLES.map((s) => (
              <div
                key={s.id}
                className="rounded-[var(--radius)] border border-[var(--line)] overflow-hidden hover:shadow-[var(--shadow-md)] transition-shadow"
              >
                <div
                  className="aspect-[3/4] flex items-center justify-center"
                  style={s.image ? undefined : { background: s.bg }}
                >
                  {s.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.image} alt={s.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-6xl opacity-80">{s.emoji}</span>
                  )}
                </div>
                <div className="p-4">
                  <p className="font-medium text-[var(--ink)] text-sm flex items-center gap-1.5">
                    <span>{s.emoji}</span> {s.name}
                  </p>
                  <p className="text-xs text-[var(--ink-soft)] mt-1">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 작동 방식 */}
      <section id="how" className="py-20">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-semibold text-[var(--ink)] mb-2">{t("howTitle")}</h2>
            <p className="text-sm text-[var(--ink-soft)]">{t("howSubtitle")}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { n: "1", title: t("step1Title"), desc: t("step1Desc") },
              { n: "2", title: t("step2Title"), desc: t("step2Desc") },
              { n: "3", title: t("step3Title"), desc: t("step3Desc") },
            ].map((step) => (
              <div key={step.n} className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center text-lg font-bold">
                  {step.n}
                </div>
                <h3 className="font-medium text-[var(--ink)] mb-2">{step.title}</h3>
                <p className="text-sm text-[var(--ink-soft)] leading-relaxed">{step.desc}</p>
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
    </div>
  );
}
