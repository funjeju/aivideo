# 개발 히스토리

## 완료

### Phase 0 · 기반 골격 ✅
- Next.js 16 (App Router) + TypeScript + Tailwind 프로젝트 생성
- 디자인 토큰 CSS 변수 주입 (`--paper`, `--ink`, `--accent` 등) + 다크모드 `.dark` 변수 세트
- Firebase 클라이언트/어드민 SDK 초기화 (`src/lib/firebase/client.ts`, `admin.ts`)
- Firestore 전체 타입 정의 (`src/lib/types.ts`)
- next-intl 다국어 토대 + `ko.json` / `en.json` 메시지 파일
- next-themes 다크모드 토대
- 라우팅 골격: `/[locale]/dashboard`, `/create`, `/project/[id]`, `/auth/signin`, `/admin/*`
- 어드민 레이아웃: 서버사이드 role 권한 검사 (staff/superadmin만 진입)
- `.env.example` + `.env.local` 구성
- 빌드 통과 (경고 0)

---

### Phase 1 · 원고 파이프라인 ✅
- LLM 원고+장면분할 API (`/api/script`) — GPT-4o, 생성/충실 모드 분기
- TTS 합성 API (`/api/tts`) — OpenAI TTS, Storage 업로드, durationSec 추정
- 원고 승인 API (`/api/approve`)
- 프로젝트 생성 API (`/api/projects`) — FormData, 파일 추출(PDF/DOCX/TXT/MD)
- `/create` 입력 화면 — 모드/길이/화풍/보이스 선택, 파일 드롭존
- `/project/[id]` 원고 승인 화면 — 장면별 인라인 편집, TTS 진행률, 승인 버튼
- 헤더 컴포넌트 (로그인 상태, 어드민 링크)
- shadcn/ui 컴포넌트 설치 (button, card, tabs, textarea, progress, badge)
- 빌드 통과

---

## 앞으로 할 것

### Phase 1 · 잔여 ✅
- 보이스 미리듣기 API (`/api/voice-preview`) — OpenAI 캐싱 샘플, Storage 캐싱
- 대시보드 프로젝트 목록 실시간 구독 (Firestore onSnapshot, 상태 뱃지, 스켈레톤)

### Phase 2 · 이미지 + Scene Spec ✅
- Style Pack 3종 정의 (`whiteboard` / `ink-wash` / `minhwa`) — 프롬프트/오버레이/Planner 파라미터
- 이미지 생성 API (`/api/images`) — GPT Image 2, Storage 업로드, 재시도 로직
- Vision 분석 API (`/api/vision`) — GPT-4o Vision, bbox/role 추출
- 4대 Planner 규칙 기반 (`src/lib/pipeline/planner.ts`) — revealOrder/strokeStyle/flowDirection/startAt/endAt
- Planner API (`/api/planner`) — Scene Spec 완성 후 Firestore 저장
- 생성 오케스트레이션 API (`/api/generate`) — 장면 병렬 처리, 진행률 기록
- approve→generate 자동 트리거
- 생성 진행률 바 (Firestore 실시간 구독)
- **렌더 코어** (`src/lib/render/renderCore.ts`) — 프레임워크 독립, Worker와 공유 예정
  - 결정적 난수(mulberry32), 마스크 리빌(flowDirection별), 손 애니메이션, 카메라 보간, 타임라인
- **브라우저 프리뷰 플레이어** (`src/components/render/ScenePlayer.tsx`) — 오디오 동기 재생, 스크럽
- 프로젝트 완료 화면에 프리뷰 연결
- 빌드 통과

### Phase 2 · 이미지 + Scene Spec
- GPT Image 2 이미지 생성 (장면당 병렬)
- 한글 in-image 텍스트 오타율 실측
- Vision 분석 (bbox/role)
- 4대 Planner (규칙 기반) → Scene Spec 완성
- Style Pack 3종 정의 (whiteboard / ink-wash / minhwa)
- 브라우저 프리뷰 렌더러

### Phase 3 · Cloud Run 렌더링 ✅ (코드 완료, 실동작 검증 대기)
- 렌더 전용 페이지 (`/render`) — Worker가 여는 헤드리스 무대, window API(`__loadScenes/__seek/__getFrame`), renderCore 단일 사용처
- Worker 패키지 (`worker/`) — 별도 배포 단위
  - `render.ts`: Firestore 읽기 → 오디오 ffprobe 길이 측정 → Puppeteer 프레임 캡처 → ffmpeg mp4 → Storage 업로드
  - `index.ts`: HTTP 서버 (`POST /render`), 진행률 Firestore 기록
  - Dockerfile (ffmpeg + Chromium deps + 한글 폰트), README(로컬 검증 + 배포 가이드)
- `/api/render` — renderJobs 생성 + Worker 트리거 (RENDER_WORKER_URL)
- ProjectView: rendering 뷰(진행률) + done 뷰(mp4 다운로드/다시 렌더링)
- renderJobs 실시간 구독
- 메인 앱 빌드 통과 (worker는 tsconfig exclude)

> ⚠️ 실동작 검증 필요: ffmpeg 설치 + worker 실행 + RENDER_WORKER_URL 설정. worker/README.md 참조.
> ⚠️ GCP 배포 시: Cloud Run 배포 + RENDER_PAGE_URL(Vercel) 설정. (Cloud Tasks 큐는 직접 호출로 대체, 필요시 추가)

### Phase 4 · 편집 + 과금 + 어드민
- 컷 단위 사후 편집 (부분 재렌더)
- 크레딧/과금
- 어드민 화면 (회원/영상/비용/보이스/템플릿)

### Phase 5 · 고도화
- 4대 Planner LLM 기반 의미 동기화
- Style Pack 확장, 다국어 TTS 등

---

### 엔드투엔드 검증 ✅ (2026-06-12)
실제로 영상 1편 mp4가 끝까지 생성됨을 확인.

| 단계 | 결과 |
|---|---|
| Firebase Firestore/Storage | ✅ CRUD + 버킷 동작 |
| OpenAI 키 + 모델 | ✅ `gpt-image-2` 실재 확인 |
| LLM 원고 (한글 8장면) | ✅ $0.006, 8초 |
| TTS 합성 + 업로드 | ✅ $0.0007 |
| **이미지 gpt-image-2 한글** | ✅ **"한계효용" 오타 0** — 1순위 리스크 해소 신호 |
| **렌더 mp4** | ✅ Puppeteer→ffmpeg, 1080×1920 H.264+AAC, 마스크 리빌/손/오디오 동기 |

발견/조치:
- **GCS 버킷 CORS 설정 필수** — 렌더 페이지가 crossOrigin=anonymous로 이미지를 canvas에 그리므로. `scripts/set-cors.mjs`로 적용 완료(origin *, GET).
- **proxy.ts에 `/render` 제외 추가** — next-intl이 `/render`를 `/ko/render`로 리다이렉트하던 문제.
- 이미지 모델명 `gpt-image-alpha`(임시) → `gpt-image-2`로 수정, `response_format` 제거(gpt-image 계열 미지원).
- ffmpeg 로컬 설치: `C:\Users\funjeju\tools\ffmpeg-8.1.1-essentials_build\bin` (winget 부재로 정적 빌드 직접 설치). Worker는 `FFMPEG_PATH`/`FFPROBE_PATH` env로 참조.
- Worker에 dotenv 추가, admin init에 storageBucket 지정.

남은 품질 개선(Phase 5 영역): bbox 사각형 clip 경계가 보임(객체 외곽 따라 부드럽게), 붓 모양 다듬기.

미검증(선택): 브라우저 UI 클릭 전체 흐름(로그인→생성→승인→mp4), 이미지 다장 동시 생성.

---

### 전반 로직 검토 (2026-06-12, Fable 5)
코드 전체 재검토 + 회귀 테스트로 버그 5건 수정, 1건은 사용자 액션 대기.

**발견 → 수정 완료:**
1. `images/route.ts` catch에서 `req.json()` 재호출(body 소비됨) → 실패 시 `imageStatus:"error"` 기록 불가 → body 파싱을 try 밖으로
2. **TTS `durationSec` 추정 공식 오류(150자/초 → 실제 ~5자/초)** → 타임라인 절대 기준이 3배 어긋남. `music-metadata`로 mp3 실측으로 교체, ffprobe와 동일값(6.19s) 검증, 라우트 회귀 테스트 통과(4.18s 저장 확인)
3. 이미지 비용 costLog 미적재 → generate에서 imageCount/imageCostUsd/imageRegenerations 집계 추가
4. `users` 문서 생성 로직 부재(읽기만 존재) → AuthProvider에서 최초 로그인 시 upsert (plan/credits/role/uiLocale/themePref)
5. **메인 앱 `admin.ts`에 storageBucket 미지정** → API 라우트 경유 Storage 업로드(TTS/이미지/업로드/미리듣기) 전부 실패하던 상태. 수정 + 실호출 검증 (admin 앱 인스턴스 캐시 때문에 dev 서버 재시작 필요했음)

**사용자 액션 필요:**
- Firestore 복합 인덱스 2개 생성 (SA 권한 부족으로 프로그래매틱 생성 불가). 없으면 대시보드/렌더잡 구독이 조용히 실패:
  - projects(ownerId ASC, createdAt DESC), renderJobs(projectId ASC, createdAt DESC)
  - 생성 링크는 `node scripts/test-indexes.mjs` 실행 시 에러 메시지에 출력됨

**알려진 한계 (다음 페이즈 영역, 보고만):**
- API 라우트 무인증 — ownerId를 클라이언트가 보냄. Firestore 보안 규칙 + 세션 검증은 Phase 4 전 필수
- `/admin` __session 쿠키 설정 로직 없음 (어드민 골격 상태)
- approve→generate fire-and-forget — Vercel 배포 시 함수 조기 종료 위험. 배포 전 Cloud Tasks 전환 필요
- planner aspect "9:16" 고정 (멀티 비율은 Phase 4 명세)
- signup 페이지 없음 (Google 로그인은 동작)

---

## 대화 기록

**사용자**: 문서 파악만 해놔
**답변**: docs/ 전체(00~07) 읽고 구조 파악 완료. 프로젝트 개요, 아키텍처, 파이프라인, Phase 순서 요약 제공.

---

**사용자**: MCP 연결은 어떻게 해야 하나, 직접 할 수 있나?
**답변**: MCP 연결은 사용자가 Claude Code 설정에서 직접 해야 함. shadcn/ui MCP는 이미 연결 확인됨(`mcp__shadcn__*` 툴 감지). Firebase/OpenAI 등은 MCP가 아니라 `.env` 파일로 처리.

---

**사용자**: 루트에 개발하는 거 잊지 말고 아직은 대기
**답변**: 루트(`C:\Users\funjeju\Desktop\aiproject\0_aivideo`) 확인, 지시 대기.

---

**사용자**: 지금 개발 착수하고 나머지 키값이랑 GCP는 중간중간 넣으면 되지?
**답변**: 맞음. `.env.local` 먼저 만들어두고 키 필요 시점에 안내하겠다고 답변. Phase 0 착수.

---

**사용자**: 개발 착수해
**답변**: Phase 0 전체 구현 완료. Next.js 프로젝트 생성, 디자인 토큰, Firebase SDK, 타입 정의, 다국어/다크모드 토대, 라우팅 골격, 어드민 권한 보호, 빌드 통과.

---

**사용자**: Firebase 키 + Service Account + OpenAI 키 + ElevenLabs 키 제공
**답변**: `.env.local`에 전체 키 주입 완료. 보안 주의사항 안내 (키 재발급 권장).

---

**사용자**: LLM API랑 프로바이더는 뭐냐?
**답변**: 원고/연출 생성용 LLM. Anthropic 또는 OpenAI 선택. OpenAI 키가 이미 있으니 그걸 쓰는 게 가장 빠름.

---

**사용자**: 프로바이더가 별도로 있는 게 이유가 뭐냐?
**답변**: 맞는 지적. OpenAI 키가 있으니 `LLM_API_KEY`/`LLM_PROVIDER` 불필요. `OPENAI_API_KEY` 하나로 통일하고 해당 변수 제거.

---

**사용자**: 필요한 키 다 들어갔나?
**답변**: Phase 0~2는 전부 OK. Phase 3에서 `CLOUD_TASKS_QUEUE`, `RENDER_WORKER_URL` 추가 필요.

---

**사용자**: 중간중간 history.md 만들어서 기록해라
**답변**: `history.md` 생성. 완료/예정 작업 + 대화 기록 관리 시작.

---

**사용자**: 일단 착수해 (Phase 1)
**답변**: Phase 1 원고 파이프라인 전체 구현. API 3종(script/tts/approve/projects), create 입력 화면, project 승인 화면, 헤더, shadcn 컴포넌트 설치. 빌드 통과.

---

**사용자**: 계속 진행해
**답변**: Phase 1 잔여(보이스 미리듣기 API, 대시보드 실시간 목록) + Phase 2 전체 구현. 이미지 생성/Vision/Planner/생성 오케스트레이션 API, Style Pack 3종 정의. 빌드 통과.

---

**사용자**: 오케이 넘어가
**답변**: Phase 2 완료 기준의 프리뷰 렌더러 구현(Worker와 코드 공유 위해 먼저). 프레임워크 독립 렌더 코어(마스크 리빌/손/카메라/결정적 난수) + 브라우저 ScenePlayer + 완료 화면 연결. 모델을 Opus 4.8로 전환(Phase 3 렌더 파이프라인 대비). 빌드 통과.

---

**사용자**: 넘어가 + (렌더 방식/배포 시점) "네가 최종 결과물 가장 좋게 뽑는 데 집중"
**답변**: 품질 기준으로 결정 — Puppeteer(headless Chromium)로 renderCore 재사용해 프리뷰=최종본 픽셀 일치, 로컬 검증 가능하게 먼저 구축 후 배포. Phase 3 전체 코드 구현(렌더 페이지/Worker/Dockerfile/api/render/UI). 실동작은 ffmpeg+worker 실행 후 검증.

---

**사용자**: 지금까지 로직이 정상적으로 잘 구현되었는지 전반적으로 검토하고 필요하면 테스트해봐
**답변**: 전수 검토 + 회귀 테스트로 버그 5건 수정(상단 "전반 로직 검토" 섹션 참조). 핵심: TTS durationSec 3배 오차(실측으로 교체), 메인앱 API 경유 Storage 업로드 전체 불능(storageBucket 미지정), users 문서 미생성, images 에러 기록 불능, 이미지 비용 미적재. Firestore 복합 인덱스 2개는 SA 권한 부족으로 사용자가 콘솔에서 생성 필요.

---

**사용자**: 오케이 내일 이어서 하자. 히스토리 md, todo md 만들어서 기록해둬
**답변**: `todo.md` 생성 — 다음 세션 첫 작업(인덱스 생성, UI 전체 흐름 검증), Phase 4 목록, 배포 체크리스트, 품질 개선 백로그, 스크립트 사용법, 환경 메모 정리. history.md도 최신화. (2026-06-12 세션 종료)
