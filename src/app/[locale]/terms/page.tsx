const UPDATED = "2026년 6월 17일";

export default function TermsPage() {
  return (
    <main className="flex-1 px-6 py-16 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-bold text-[var(--ink)] mb-1">이용약관</h1>
      <p className="text-xs text-[var(--ink-faint)] mb-10">시행일: {UPDATED}</p>

      <div className="space-y-7 text-sm leading-relaxed text-[var(--ink-soft)]">
        <Section title="제1조 (목적)">
          본 약관은 (주)펀제주(이하 &ldquo;회사&rdquo;)가 제공하는 Easyshorts 서비스(이하 &ldquo;서비스&rdquo;)의 이용과
          관련하여 회사와 이용자 간의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.
        </Section>

        <Section title="제2조 (정의)">
          <ul className="list-disc pl-5 space-y-1">
            <li>&ldquo;서비스&rdquo;란 주제·자료를 입력하면 드로잉-리빌 형식의 설명 영상을 자동 생성하는 회사의 온라인 서비스를 말합니다.</li>
            <li>&ldquo;회원&rdquo;이란 본 약관에 동의하고 회사와 이용계약을 체결한 자를 말합니다.</li>
            <li>&ldquo;크레딧&rdquo;이란 영상 생성 등 유료 기능 이용에 사용되는 서비스 내 사용권을 말합니다.</li>
            <li>&ldquo;구독&rdquo;이란 매월 정기결제로 일정 크레딧 및 등급별 혜택을 제공받는 유료 이용 형태를 말합니다.</li>
          </ul>
        </Section>

        <Section title="제3조 (회원가입 및 계정)">
          회원가입은 Google 계정 인증으로 이루어지며, 이용자는 본 약관 및 개인정보처리방침에 동의함으로써
          이용계약이 성립합니다. 이용자는 본인의 계정을 선량한 관리자의 주의로 관리해야 합니다.
        </Section>

        <Section title="제4조 (서비스의 내용)">
          회사는 영상 자동 생성, 미리보기, 장면 편집, mp4 다운로드 등의 기능을 제공합니다. 회사는 서비스의
          품질 향상을 위해 기능을 추가·변경할 수 있으며, 중대한 변경 시 사전 공지합니다.
        </Section>

        <Section title="제5조 (구독 및 결제)">
          <ul className="list-disc pl-5 space-y-1">
            <li>유료 구독은 신용·체크카드 또는 카카오페이 자동결제(정기결제)로 결제됩니다.</li>
            <li>구독은 결제일 기준 매월 자동으로 갱신되며, 갱신 시 등급별 포함 크레딧이 충전됩니다.</li>
            <li>요금 및 포함 크레딧은 요금제 페이지에 고지된 바에 따릅니다. 결제 대행은 포트원(PortOne) 및 연동 PG사를 통해 처리됩니다.</li>
            <li>회사는 요금을 변경할 수 있으며, 변경 시 적용 전 회원에게 공지합니다.</li>
          </ul>
        </Section>

        <Section title="제6조 (크레딧)">
          <ul className="list-disc pl-5 space-y-1">
            <li>크레딧은 영상 생성·재생성 등 유료 기능 이용 시 차감되며, 차감 단위는 이용 시점에 고지됩니다.</li>
            <li>구독 포함 크레딧은 해당 결제 주기 내 사용을 원칙으로 하며, 별도 충전 크레딧과 합산되어 사용될 수 있습니다.</li>
            <li>크레딧은 현금으로 환급되지 않으나, 본 약관 제7조의 환불 사유에 해당하는 경우 미사용분에 한해 환불될 수 있습니다.</li>
          </ul>
        </Section>

        <Section title="제7조 (청약철회 및 환불)">
          <ul className="list-disc pl-5 space-y-1">
            <li>회원은 결제일로부터 7일 이내, 크레딧을 전혀 사용하지 않은 경우 청약을 철회하고 전액 환불받을 수 있습니다.</li>
            <li>크레딧을 일부 사용한 경우, 「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 디지털콘텐츠의 사용이 개시된 부분에 대해서는 청약철회가 제한될 수 있으며, 미사용 크레딧에 한해 잔여 가치를 환불합니다.</li>
            <li>자동 갱신된 구독은 갱신일로부터 7일 이내·미사용 시 환불 가능하며, 다음 결제는 해지로 중단할 수 있습니다.</li>
            <li>환불 요청은 고객센터(아래 사업자정보)로 접수하며, 결제수단으로의 취소 또는 동등 가치로 처리됩니다.</li>
          </ul>
        </Section>

        <Section title="제8조 (구독 해지)">
          회원은 언제든지 &lsquo;내 구독&rsquo; 화면에서 구독을 해지할 수 있습니다. 해지 시 현재 결제 주기가
          끝날 때까지 서비스를 이용할 수 있으며, 이후 자동결제는 진행되지 않습니다.
        </Section>

        <Section title="제9조 (저작권 및 콘텐츠)">
          이용자가 입력한 자료에 대한 권리는 이용자에게 있으며, 이용자는 타인의 권리를 침해하지 않는 범위에서
          서비스를 이용해야 합니다. 생성된 영상의 이용 권리는 해당 요금제 정책에 따릅니다.
        </Section>

        <Section title="제10조 (책임의 제한)">
          회사는 천재지변, 외부 API·인프라 장애 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.
          회사는 생성 결과물의 정확성·적합성을 보증하지 않으며, 이용자는 결과물을 검토 후 사용해야 합니다.
        </Section>

        <Section title="제11조 (분쟁 해결 및 준거법)">
          본 약관은 대한민국 법률에 따라 해석되며, 서비스 이용과 관련한 분쟁에 대해서는 회사의 본점 소재지를
          관할하는 법원을 전속 관할법원으로 합니다.
        </Section>

        <Section title="사업자 정보">
          <ul className="space-y-0.5">
            <li>상호: (주)펀제주 · 대표: 심대훈</li>
            <li>사업자등록번호: 213-86-43462</li>
            <li>주소: 제주특별자치도 제주시 연삼로 411 314호</li>
            <li>문의: 010-4434-2483 · naggu1999@naver.com</li>
          </ul>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-[var(--ink)] mb-2">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
