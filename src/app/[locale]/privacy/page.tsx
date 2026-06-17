const UPDATED = "2026년 6월 17일";

export default function PrivacyPage() {
  return (
    <main className="flex-1 px-6 py-16 max-w-3xl mx-auto w-full">
      <h1 className="text-2xl font-bold text-[var(--ink)] mb-1">개인정보처리방침</h1>
      <p className="text-xs text-[var(--ink-faint)] mb-10">시행일: {UPDATED}</p>

      <div className="space-y-7 text-sm leading-relaxed text-[var(--ink-soft)]">
        <Section title="1. 수집하는 개인정보 항목">
          <ul className="list-disc pl-5 space-y-1">
            <li>회원가입·인증: 이메일 주소, 이름(Google 계정 제공 정보), 프로필 이미지</li>
            <li>결제: 구독·결제 시 휴대폰 번호, 결제 식별값(빌링키 등). <b>카드번호 등 결제수단 상세정보는 회사가 보관하지 않으며</b> 결제대행사(포트원 및 연동 PG사)가 처리·보관합니다.</li>
            <li>서비스 이용: 생성한 프로젝트·영상 데이터, 크레딧 거래내역, 접속 로그</li>
          </ul>
        </Section>

        <Section title="2. 개인정보의 이용 목적">
          회원 식별 및 관리, 서비스 제공(영상 생성·저장·다운로드), 유료 구독·결제 및 정산, 고객 문의 응대,
          서비스 개선 및 부정 이용 방지를 위해 이용합니다.
        </Section>

        <Section title="3. 보유 및 이용 기간">
          회원 탈퇴 시 지체 없이 파기합니다. 다만 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다
          (전자상거래 등에서의 소비자보호에 관한 법률 등에 따른 거래·결제 기록 5년 등).
        </Section>

        <Section title="4. 개인정보의 제3자 제공 및 처리위탁">
          회사는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만 서비스 제공을 위해 아래와 같이
          업무를 위탁·연동합니다.
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>결제 처리: 포트원(PortOne), KG이니시스, 카카오페이 — 결제 및 정산</li>
            <li>인증·데이터 저장: Google Firebase(Authentication, Firestore, Storage) — 계정·데이터 보관</li>
            <li>컴퓨팅·생성: Google Cloud, OpenAI 등 — 영상·음성·이미지 생성 처리</li>
          </ul>
        </Section>

        <Section title="5. 이용자의 권리">
          이용자는 언제든지 본인의 개인정보를 조회·수정하거나 회원 탈퇴를 통해 삭제를 요청할 수 있습니다.
          요청은 아래 개인정보 보호책임자에게 연락하여 처리할 수 있습니다.
        </Section>

        <Section title="6. 개인정보의 안전성 확보 조치">
          회사는 개인정보 보호를 위해 접근 권한 관리, 전송 구간 암호화(HTTPS), 결제 비밀정보의 비보관 등
          합리적인 보호 조치를 시행합니다.
        </Section>

        <Section title="7. 개인정보 보호책임자">
          <ul className="space-y-0.5">
            <li>책임자: 심대훈 ((주)펀제주 대표)</li>
            <li>연락처: 010-4434-2483 · naggu1999@naver.com</li>
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
