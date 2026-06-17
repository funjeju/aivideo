export default function Footer({ locale = "ko" }: { locale?: string }) {
  return (
    <footer id="contact" className="border-t border-[var(--line)] bg-[var(--paper-raised)] scroll-mt-20">
      <div className="max-w-4xl mx-auto px-6 py-12 text-center">
        {/* Contact us (하단 중앙) */}
        <h3 className="text-lg font-semibold text-[var(--ink)] mb-1">Contact us</h3>
        <p className="text-sm text-[var(--ink-soft)] mb-4">문의·제휴·도입 상담 언제든 연락 주세요.</p>
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          <a
            href="mailto:naggu1999@naver.com"
            className="px-5 py-2.5 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            이메일 문의
          </a>
          <a
            href="tel:01044342483"
            className="px-5 py-2.5 rounded-[var(--radius)] border border-[var(--line)] text-[var(--ink)] text-sm font-medium hover:bg-[var(--paper-sunken)] transition-colors"
          >
            010-4434-2483
          </a>
        </div>

        {/* 약관 링크 */}
        <div className="flex items-center justify-center gap-4 text-xs text-[var(--ink-soft)] mb-5">
          <a href={`/${locale}/terms`} className="hover:text-[var(--accent)]">이용약관</a>
          <span className="text-[var(--ink-faint)]">·</span>
          <a href={`/${locale}/privacy`} className="hover:text-[var(--accent)] font-medium">개인정보처리방침</a>
        </div>

        {/* 사업자 정보 */}
        <div className="text-xs text-[var(--ink-faint)] leading-relaxed border-t border-[var(--line)] pt-6">
          <p>(주)펀제주 · 대표 심대훈 · 사업자등록번호 213-86-43462</p>
          <p>주소 : 제주특별자치도 ○○ (준비중)</p>
          <p>문의 : 010-4434-2483 / naggu1999@naver.com</p>
          <p className="mt-2">© 2025 FunJeju. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
