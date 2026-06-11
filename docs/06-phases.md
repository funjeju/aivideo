# 06 · PHASES — 개발 로드맵

> 전체 구조를 페이즈로 나눈 것. 각 페이즈는 이전 페이즈 위에 쌓인다.
> "MVP/비MVP" 구분은 하지 않는다 — 전체를 단계적으로 쌓아 올리는 순서로 본다.

---

## Phase 0 · 기반 (Foundation)

목표: 빈 화면이라도 로그인하고 프로젝트를 만들 수 있는 골격.

- Next.js(App Router) + Vercel 배포 세팅, `.env.example` 작성.
- Firebase 연결: Auth(Google/이메일), Firestore, Storage. 보안 규칙 초안.
- shadcn/ui **MCP 연결** + 디자인 토큰(`05-design-system.md`) 주입.
- 라우팅 골격: `/dashboard`, `/create`, `/project/[id]`, `/(auth)`, **`/admin`(권한 보호 빈 골격)**.
- 데이터 모델 구현: `users`(+role/uiLocale/themePref), `projects`(+contentLocale), `scenes`, `renderJobs`, `stylePacks`, `voices` (`03-data-schema.md`).
- **어드민 권한 토대**: `users.role`(user/staff/superadmin) + Firebase Custom Claims + `/admin` 서버사이드 권한 검사 (`07-admin.md` 1절).
- **다크모드 토대**: 색 토큰 변수화(완료) + `.dark` 변수 세트 + 헤더 토글 + `themePref`. (기본 light, `05-design-system.md` 6.5)
- **다국어 토대**: `next-intl` 문자열 분리 + `uiLocale` 토글. (하드코딩 한글 금지, `05-design-system.md` 6.6)

**완료 기준**: 로그인 → 빈 프로젝트 생성 → Firestore에 문서 저장 → 대시보드에 표시. `/admin`은 권한 없으면 차단.

> ⚠️ 이 페이즈 시작 전 사용자에게 요청: shadcn MCP 연결, Firebase 자격증명, 액센트 컬러 확정.

---

## Phase 1 · 원고 파이프라인 (텍스트까지)

목표: 입력 → 원고 → 승인까지. **이미지/렌더 없이 텍스트만.** (가장 싸고 빠르게 검증 가능한 핵심 루프)

- 입력 화면(`/create`): 생성/충실 모드, 3개 선택(길이/화풍/보이스) + 콘텐츠 언어.
- **보이스 미리듣기**: `voices` 풀 + ▶ 미리듣기 재생(ElevenLabs preview URL / OpenAI 캐싱 샘플). (`07-admin.md` 3절)
- 충실 모드 파일 추출(PDF/DOCX/TXT/MD → `sourceText`).
- Step 2: LLM 원고+장면분할 (모드별 프롬프트 분기, JSON 출력). (`04-pipeline.md`)
- Step 3: TTS 합성 → `durationSec` 확정.
- **원고 승인 체크포인트** 화면 + 인라인 편집.
- 비용 로깅 기초(`costLog.llm/tts`).

**완료 기준**: 주제 입력 → 장면별 나레이션 + 오디오 생성 → 사용자가 검토·수정·승인. 영상은 아직 없음.

---

## Phase 2 · 이미지 + 연출 (Scene Spec 완성)

목표: 승인된 원고로부터 완성된 Scene Spec 만들기. **아직 영상 인코딩 전, 프론트 프리뷰로 확인.**

- Step 4: GPT Image 2 이미지 생성(병렬, 장면당 1~2장, 비율 정합). 재생성 로직.
- **한글 in-image 텍스트 오타율 실측** ← 이 페이즈의 1순위 리스크 검증. 결과에 따라 `textStrategy`(in-image/overlay/hybrid) 확정.
- Step 5: Vision 분석(bbox/role).
- Step 6: 4대 Planner — **규칙 기반 먼저**(Style Pack 기본값). Scene Spec 완성.
- Style Pack 3종 정의(`whiteboard`, `ink-wash`, `minhwa`): 프롬프트·오버레이·plannerDefaults·에셋(한지/낙관 등).
- **프론트 프리뷰 렌더러**(`components/render/`): Scene Spec → 브라우저에서 마스크 리빌 미리보기. (Worker와 코드 공유 목표)

**완료 기준**: 승인 원고 → 화풍별 이미지 생성 → 프론트에서 드로잉-리빌 프리뷰 재생.

---

## Phase 3 · 렌더링 + 출력 (Cloud Run Worker)

목표: 프리뷰를 실제 mp4 파일로. 진행률·다운로드·공유.

- Cloud Run Render Worker 구축(`/worker`): headless Chromium에서 프리뷰 렌더 코드 재사용 → 프레임 캡처 → ffmpeg mp4.
- Cloud Tasks 큐 + Vercel `/api/render`(작업 등록만, jobId 반환).
- 진행률: Worker가 `renderJobs.progress` 갱신 → 프론트 실시간 구독 바.
- 완성 mp4 Storage 업로드 + 서명 URL 다운로드/공유.
- 비용 로깅 완성(`costLog.render/total`).
- **결정적 렌더 검증**: 같은 Scene Spec → 동일 출력.

**완료 기준**: 승인 → 자동 생성 → 진행률 → mp4 다운로드. 엔드투엔드 1편 완성.

---

## Phase 4 · 편집 + 비용 최적화

목표: 사후 편집과 운영 효율.

- Step 8 사후 편집: "이 그림 다시 / 이 문장 수정 / 순서·길이 변경" → 부분 재렌더(`type: "partial"`).
- draft-cheap 토글(low/medium 프리뷰 → high 확정) 옵션.
- 멀티 비율 출력(9:16 / 16:9 / 1:1).
- 크레딧/과금: `costLog` 기반 차감, 플랜별 한도. 세그먼트별 과금(크리에이터 구독 / 교수 단건).
- **어드민 화면 (`07-admin.md`)**: 회원 관리, 생성 영상 관리, 비용·매출 대시보드, 보이스 풀 관리. 운영 시작에 맞춰 구축.
- **템플릿(Style Pack) 관리**: Style Pack을 코드 상수 → Firestore `stylePacks` 컬렉션으로 승격. 어드민이 코드 배포 없이 정의·편집, 썸네일 등록, 활성/비활성 토글. (`07-admin.md` 2.3)

**완료 기준**: 영상 생성 후 컷 단위 수정이 전체 재생성 없이 동작 + 크레딧 차감 정확 + 운영자가 회원·영상·템플릿·비용을 어드민에서 관리.

---

## Phase 5 · 고도화 (점진적)

- 4대 Planner의 LLM 기반 의미 동기화(규칙 → 지능형). 차별화 해자 강화.
- Style Pack 확장(웹툰풍·우키요에 등).
- 캐릭터 반복 서사 모드(캐릭터 시트 1회 생성 후 레퍼런스 재사용).
- 사용자 녹음 나레이션 모드, 배경음/효과음(폴리) 자동 매칭.
- 다국어 TTS, 기관 라이선스.

---

## 페이즈별 검증 우선순위 (리스크 순)

1. **Phase 2의 한글 in-image 텍스트 오타율** — 사업 성패의 핵심 기술 리스크. 가장 먼저 실측.
2. **Phase 3의 렌더 결정성·속도** — 비용·품질 직결.
3. **Phase 2의 수묵/민화 화풍 톤 유지** — 차별화 품질.

> 각 페이즈 완료 시 실제 1편을 생성해 `costLog`를 측정하고, `01-core.md`의 원가 추정치와 대조해 단가·과금을 보정한다.
