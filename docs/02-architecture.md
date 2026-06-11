# 02 · ARCHITECTURE — 기술 스택과 시스템 구조

## 1. 스택 한눈에

| 영역 | 기술 | 역할 |
|---|---|---|
| 프론트엔드 | **Next.js (App Router) on Vercel** | 사용자 UI, 짧은 API 라우트 |
| 인증 | **Firebase Auth** | 로그인/회원 (Google·이메일) |
| DB | **Firebase Firestore** | 프로젝트·장면·작업 상태 저장 |
| 파일 저장 | **Firebase Storage** | 생성 이미지·완성 영상·업로드 문서 |
| 영상 렌더링 | **Google Cloud Run (Render Worker)** | 오래 걸리는 영상 굽기 (Vercel 밖) |
| 작업 큐 | **Cloud Tasks** 또는 Firestore 트리거 | 렌더 작업 디스패치 |
| 이미지 생성 | **OpenAI GPT Image 2 API** | 장면 이미지 (high, 1024×1536 / 1536×1024) |
| 음성 | **OpenAI TTS** (기본) / ElevenLabs(프리미엄 옵션) | 나레이션 |
| LLM | **Claude 또는 GPT** | 원고·장면분할·연출 JSON 생성 |
| UI 컴포넌트 | **shadcn/ui (MCP 연결)** | 디자인 시스템 (`05-design-system.md`) |

---

## 2. 왜 렌더링을 Vercel 밖으로 빼는가 (핵심 결정)

Vercel 서버리스 함수는 짧은 요청용으로 설계되어 실행 시간 상한이 있다. fluid compute를 켜도 무제한 실행은 불가하며, 무제한 실행이 필요한 워크로드는 별도 처리가 필요하다(Vercel 공식 문서 기준, 2026). 그런데 우리의 영상 렌더링(이미지 N장 → 프레임별 마스크 리빌 애니메이션 → 음성 합성 → mp4 인코딩)은 5분 영상 기준 수 분~수십 분이 걸린다.

→ **결론: 영상 렌더링은 Cloud Run 위의 "Render Worker"가 전담한다.** Vercel은 주문만 받고(카운터), Cloud Run이 영상을 굽는다(주방). Cloud Run은 Firebase와 같은 GCP 생태계라 연동이 쉽고, 작업이 있을 때만 켜져 사용 시간만큼만 과금되어 비용 구조에 부합한다.

> Claude Code 참고: Vercel API 라우트에서는 "작업 생성 → 큐에 등록 → 즉시 jobId 반환"까지만. 실제 렌더는 Worker가 비동기로 수행하고 진행률을 Firestore에 기록. 프론트는 Firestore를 구독해 진행률 바를 갱신.

---

## 3. 시스템 다이어그램 (논리 구조)

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT (브라우저)  — Next.js UI on Vercel                    │
│  · 입력/선택 화면  · 원고 승인  · 진행률 구독  · 사후 편집     │
└───────────────┬─────────────────────────────▲────────────────┘
                │ (API 호출)                   │ (Firestore 실시간 구독)
                ▼                              │
┌─────────────────────────────────────────────┴────────────────┐
│  VERCEL  — Next.js API Routes (짧은 작업만)                    │
│  · /api/script    원고+장면분할 생성 (LLM 호출)               │
│  · /api/approve   원고 확정 → 이미지/연출 작업 큐 등록         │
│  · /api/images    이미지 생성 디스패치 (GPT Image 2)          │
│  · /api/render    렌더 작업을 Cloud Tasks에 등록 → jobId 반환 │
│  · /api/edit      장면 JSON 부분 수정 → 부분 재렌더 큐 등록    │
└──────┬──────────────────────────┬──────────────────┬─────────┘
       │                          │                  │
       ▼                          ▼                  ▼
┌────────────┐          ┌──────────────┐    ┌─────────────────┐
│ OpenAI API │          │  Firebase     │    │  Cloud Tasks    │
│ ·GPT Image2│◄────────►│  ·Auth        │    │  (작업 큐)       │
│ ·TTS       │          │  ·Firestore   │    └────────┬────────┘
│ LLM API    │          │  ·Storage     │             │
└────────────┘          └──────▲────────┘             ▼
                               │              ┌──────────────────┐
                               │ (결과 기록)   │ CLOUD RUN         │
                               └──────────────┤ Render Worker     │
                                              │ · 장면JSON 수신    │
                                              │ · 마스크 리빌 렌더 │
                                              │ · ffmpeg 인코딩    │
                                              │ · Storage 업로드   │
                                              │ · 진행률 Firestore │
                                              └──────────────────┘
```

---

## 4. Render Worker 내부 (Cloud Run)

- 런타임: Node.js (헤드리스 렌더링). 캔버스 렌더는 headless Chromium(Puppeteer) 또는 서버사이드 Canvas(`node-canvas`/`skia-canvas`) 중 택1.
  - **권장**: 프론트 프리뷰와 렌더 로직을 공유하려면 headless Chromium에서 동일 렌더 코드 실행 → 프리뷰=최종본 일치 보장.
- 입력: 장면 JSON + 이미지 URL 목록 + 나레이션 오디오 URL.
- 처리: 장면별로 (이미지 위에 마스크 리빌 + 손 애니메이션 + 카메라 무빙) 프레임 생성 → 오디오 합성 → `ffmpeg`로 mp4(H.264) 인코딩.
- 출력: Storage에 mp4 업로드 → Firestore 작업 문서에 `status: done`, `outputUrl` 기록.
- **결정성**: Seeded Random 사용. 같은 장면 JSON → 같은 영상. (부분 재렌더 시 변경된 장면만 다시 구움)

---

## 5. 환경 변수 (사용자에게 요청, 하드코딩 금지)

`.env.local` (Vercel) 및 Cloud Run 환경에 분리 주입:

```
# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
FIREBASE_ADMIN_SA_KEY=        # 서버용 service account (Vercel/Cloud Run)

# OpenAI
OPENAI_API_KEY=               # GPT Image 2 + TTS

# LLM (원고/연출)
LLM_API_KEY=                  # Anthropic 또는 OpenAI
LLM_PROVIDER=                 # "anthropic" | "openai"

# (옵션) ElevenLabs
ELEVENLABS_API_KEY=

# Cloud Run / Tasks
GCP_PROJECT_ID=
CLOUD_TASKS_QUEUE=
RENDER_WORKER_URL=            # Cloud Run 서비스 URL
```

> Claude Code: 키가 없으면 더미값으로 진행하지 말고 **사용자에게 요청**. `.env.example`을 만들어 두고, 실제 값은 사용자가 채우도록 안내.

---

## 6. 디렉터리 구조 (제안)

```
/app                     Next.js App Router
  /(auth)                로그인
  /dashboard             프로젝트 목록
  /create                입력/선택 화면
  /project/[id]          원고 승인 → 진행률 → 편집
  /api                   짧은 API 라우트 (위 3절 참조)
/components
  /ui                    shadcn/ui (MCP로 설치)
  /editor                장면 편집·프리뷰 컴포넌트
  /render                프론트 프리뷰 렌더러 (Worker와 코드 공유)
/lib
  /firebase              client/admin SDK 초기화
  /llm                   원고·연출 JSON 생성 프롬프트
  /style-packs           Style Pack 정의 (프롬프트·오버레이·연출 파라미터)
  /pipeline              단계별 오케스트레이션
/worker                  Cloud Run Render Worker (별도 배포 단위)
  Dockerfile
  render.ts              메인 렌더 로직
/docs                    이 명세서 묶음
```

---

## 7. 보안·권한

- Firestore 보안 규칙: 사용자는 본인 `ownerId` 문서만 read/write.
- Storage 규칙: 본인 경로만 접근. 완성 영상은 서명 URL(signed URL)로 공유.
- 외부 API 키는 **클라이언트에 절대 노출 금지** — 모든 외부 호출은 Vercel API 라우트 또는 Worker 경유.
