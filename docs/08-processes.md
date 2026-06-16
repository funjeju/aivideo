# 08 — 전체 프로세스/아키텍처 레퍼런스

> 이 문서는 **현재 코드 기준**으로 프로젝트에서 실제로 돌아가는 모든 프로세스를 정리한다.
> 어떤 로직으로 처리되고, 어떤 기술/외부 API/솔루션을 어떻게 얹어 쓰는지, 어떻게 최적화돼 있는지.
> (작성: 2026-06-17, worker rev 00037-ztm / sceneHash v32)

---

## 0. 한눈에 보는 전체 흐름

```
[입력] create ─┬─ 일반: 주제(generate) / 파일·원고(faithful)
               └─ 업소용: 사명+로고 + (주제 or 원고)
   │  /api/projects (프로젝트 doc 생성, 로고/원고 업로드)
   │  /api/script   (LLM이 장면별 narration+visualIntent 생성)
   ▼
[원고 검토] (클라이언트) ── 사용자가 나레이션 편집
   │  /api/tts × N장면  (OpenAI TTS → mp3 + 실측 길이) ── 동시 3개
   │  /api/approve      (과금 게이트 통과 → status=approved)
   ▼
[생성 오케스트레이션] /api/generate ── 장면당 4개씩 병렬(BATCH=4)
   │  /api/images  (gpt-image-2: 장면 이미지)
   │  /api/vision  (gpt-4o or Gemini: 그릴 객체/순서/앵커 분석)
   │  /api/planner (시간 동기화 SceneSpec 생성)  → status=done
   ▼
[렌더] /api/thumbnail → /api/render
   │  Cloud Tasks(render-queue)에 적재
   ▼  Cloud Run Worker ── 렌더마다 인스턴스 분리(4코어 독점, 진짜 병렬)
   │  node-canvas 프레임 그림 → raw RGBA → ffmpeg(libx264) 파이프 → 세그먼트 mp4
   │  세그먼트 concat + AAC → 최종 mp4 → Storage → status=done
   ▼
[편집] /api/edit/scene ── 장면 JSON만 수정 → 변경된 장면만 부분 재렌더(sceneHash 캐시)
```

진행 상태는 **Firestore 문서**(`projects/{id}.status`, `generateProgress`, `renderJobs/{id}.progress`)로 흐르고, 프론트는 이를 **실시간 구독**해 진행률 UI를 갱신한다.

---

## 1. 기술 스택 / 솔루션 맵

| 레이어 | 솔루션 | 역할 |
|---|---|---|
| 프론트 + 짧은 API | **Next.js (App Router) on Vercel** | UI, 인증 검증, 파이프라인 오케스트레이션, 큐 적재 |
| 인증 | **Firebase Auth** | 사용자 로그인, ID 토큰 |
| DB | **Firestore** | 프로젝트/장면/잡/설정/보이스/유저 문서, 진행률 채널 |
| 파일 저장 | **Firebase Storage** | 이미지·오디오·로고·원본·썸네일·최종 mp4 (공개 URL) |
| 장시간 렌더 | **Google Cloud Run** (Worker) | mp4 렌더링 (Vercel 밖, 분 단위 작업) |
| 작업 큐 | **Google Cloud Tasks** | 렌더 작업 비동기 전달 + 재시도 + 페이싱 |
| 원고·연출 LLM | **OpenAI gpt-4o(기본)** / 선택지: gpt-4.1, gpt-5, o4-mini, **Gemini 2.5 Flash** | 원고 생성, Vision 객체 분석 |
| 이미지 | **OpenAI gpt-image-2** (low/medium/high) | 장면 이미지, 로고 reference(edit) |
| 음성 | **OpenAI TTS (tts-1)** | 나레이션 mp3 (보이스 9종) |
| 렌더 엔진 | **@napi-rs/canvas (Skia)** + **ffmpeg(libx264/AAC)** | 프레임 드로잉 + 영상 인코딩 |
| 배포 | Vercel(자동, GitHub main) / Cloud Run(`gcloud run deploy`) | |

> 외부 API 키는 **전부 서버 전용**. 클라이언트는 어떤 외부 API도 직접 호출하지 않고 Next API 라우트/Worker를 경유한다.

---

## 2. 인프라 토폴로지

```
                 ┌─────────────────────────────────────────────┐
   브라우저 ───►  │  Vercel (Next.js)                            │
   (Firebase     │   /api/projects /script /tts /approve        │
    Auth 토큰)   │   /generate /images /vision /planner          │
                 │   /render /thumbnail /edit/scene  + /admin/*  │
                 └───┬───────────────┬──────────────┬───────────┘
                     │               │              │ enqueue
            (ID토큰 검증)      OpenAI / Gemini   Cloud Tasks(render-queue)
                     │               │              │ HTTP(+x-worker-secret)
                     ▼               ▼              ▼
              Firebase         (이미지/음성/    Cloud Run Worker
          (Firestore/Storage)   LLM/Vision)    (동기 렌더, concurrency=1,
                     ▲                            max-instances=6, 4vCPU/4Gi)
                     └──────── 진행률/결과 기록 ◄──────┘
```

- **Cloud Run 설정**: `--no-cpu-throttling --concurrency 1 --max-instances 6 --cpu 4 --memory 4Gi --timeout 3600 --allow-unauthenticated`
- **Cloud Tasks 큐(render-queue, asia-northeast3)**: max-concurrent-dispatches=6, max-attempts=3, dispatch-deadline=1800s
- GCP 프로젝트 `golpo-b6407`, 배포 계정 `funjejuai@gmail.com`

---

## 3. 단계별 프로세스 상세

### 3-0. 입력 — `/create` + `/api/projects`
- 3가지 입력 모드 (탭): **generate**(주제) / **faithful**(파일·원고) / **corporate**(업소용).
- 공통 선택: 길이(슬라이더 20초~20분), 화면비율(9:16/16:9/1:1), 화풍(12종 카드), 보이스(Firestore `voices`에서 로드).
- **업소용**: 회사명(국/영) + 로고 업로드(+반영 토글) + (주제 또는 원고 직접입력 토글).
- `/api/projects`(formData): ID 토큰 검증 → 프로젝트 doc 생성.
  - faithful 파일: `extractText`로 텍스트 추출 + Storage 업로드.
  - 업소용: 로고 Storage 업로드 후 `corporate{companyKo,companyEn,logoUrl,useLogoRef}` 저장. 붙여넣은 원고는 `sourceText`로 저장.

### 3-1. 원고 생성 — `/api/script`
- `buildScriptPrompt`(mode별)로 LLM 호출. **장면 수 = 길이/7초**, 장면당 나레이션 48~56자(TTS ~7자/초 실측 기반)로 강제.
- LLM 모델은 어드민 `settings/global.llmModel`로 선택(기본 gpt-4o). **Gemini 선택 시 키 없으면 gpt-4o로 자동 폴백**(500 방지).
- faithful: body에 sourceText 없으면 **project doc에서 폴백 읽기**(파일/붙여넣기 모두 동작).
- 결과: 기존 장면 삭제 후 `scenes` 서브컬렉션에 narration/visualIntent 저장, status=`script_ready`.

### 3-2. 원고 검토 + TTS (클라이언트 `ProjectView`)
- 사용자가 장면별 나레이션을 편집할 수 있음.
- "승인하고 영상 만들기" 클릭 → **TTS 합성**: `/api/tts`를 **동시 3개**, 각 45초 타임아웃 **3회 재시도(백오프)**.
  - **멱등**: 이미 음성이 있고 나레이션이 안 바뀐 장면은 건너뜀 → 재시도 시 실패분만.
- `/api/tts`: OpenAI `tts-1` → mp3 Storage 업로드. **`music-metadata`로 실제 재생 길이(durationSec)를 측정**(추정 아님 — 타임라인의 절대 기준).

### 3-3. 승인 + 과금 게이트 — `/api/approve`
- **과금 게이트**(`checkBillingGate`): 길이 기준 예상 원가로 크레딧 확인 → 부족 시 402.
- 통과 시 status=`approved`. (이미지 생성=실제 비용 발생 직전 지점에 게이트)
- 서버 fire-and-forget이 Vercel에서 잘리므로, **이미지 생성 트리거는 클라이언트가 `status=approved`를 보고 직접 `/api/generate` 호출**.

### 3-4. 생성 오케스트레이션 — `/api/generate` (maxDuration 800s)
장면을 **BATCH=4 병렬**로, 각 장면에 대해 순차:
1. **`/api/images`** — gpt-image-2로 장면 이미지(타임아웃 180s). 화질은 `settings.imageQuality` 우선. 업소용이면 **매 장면 프롬프트에 사명 정확표기 지시 + (토글 시) 로고 fetch해 `images.edit`로 반영**. 내부 재시도 2회 + SDK 백오프 5회(429 흡수).
2. **`/api/vision`** — gpt-4o(또는 Gemini)가 이미지를 보고 **그릴 객체(bbox 0~1000) / role / revealOrder / anchorText(나레이션 구절)** 를 분석(타임아웃 90s, 1회 재시도).
3. **`/api/planner`** — `buildSceneSpec`으로 **시간 동기화 SceneSpec** 생성.
- **멱등 재개**: 이미 `imageUrl + sceneSpec.reveal`까지 끝난 장면은 건너뜀 → 중단 후 재호출 시 이어서.
- **취소**: 배치 사이마다 `cancelRequested` 확인 → 켜지면 즉시 중단.
- 완료 시 status=`done`, 이미지 비용 적재, (과금 ON & 비면제) **크레딧 차감**.

#### Planner 로직 (연출의 핵심)
- **Sync 모드**(기본): `anchorText`(나레이션 구절)가 발화되는 시점에 객체를 그리기 시작. 나레이션을 글자수 비례 균일속도로 읽는다고 보고 `anchor위치비율 × 0.85×durationSec = startAt`.
  - Vision이 구절을 정확히 복사 못 하는 경우가 많아(조사 변형/잘림) **정규화 + 앞뒤 부분일치**로 강건 매칭. 실패 시 순서 기반 균등 폴백.
  - 여러 객체가 같은 지점에 몰리지 않게 **최소 간격(minGap)** 강제 → "한꺼번에 그려짐" 방지.
- **Topdown 모드**: anchor 무시, 화면 위→아래 균등 슬롯 순차.
- 화풍별 배경(white/paper-hanji/dark), 붓 도구/속도/번짐(inkSpread)/채움범위(fillRange), 자막 on/off를 SceneSpec에 박는다.

### 3-5. 렌더 — `/api/thumbnail` → `/api/render` → Cloud Tasks → Worker
1. **`/api/thumbnail`**: 선택 장면 이미지에 훅 제목을 중앙 합성한 썸네일 생성.
2. **`/api/render`**: `renderJobs` 문서 생성 → **Cloud Tasks `render-queue`에 적재**(즉시 반환). 로컬 dev(큐 미설정)는 직접 fetch 폴백.
3. **Cloud Tasks** → Worker `/render`로 HTTP 전달(`x-worker-secret` 헤더, 재시도 최대 3).
4. **Worker(동기 렌더)**: 렌더 끝까지 응답 보류 → Cloud Run이 인스턴스를 "바쁨"으로 인식 → **렌더마다 새 인스턴스(4코어 독점) = 진짜 병렬**. done=200 / cancelled=200(재시도X) / error=500(재시도). 이미 done/cancelled면 스킵.

#### Worker 렌더 엔진 (결정적)
- 입력 = **SceneSpec(JSON) + 이미지 + 오디오**. 같은 입력이면 같은 출력(seededRandom).
- **드로잉 엔진 "판서"**: 잉크 이진화 → Zhang-Suen 세선화 → 획(stroke) 추출 → 객체별 획 순서대로 실제 선을 따라 그림 + 영역 분할 채움. endAt에 100% 완성 보장.
- **프레임 인코딩**: `@napi-rs/canvas`로 프레임을 그려 **raw RGBA를 ffmpeg stdin에 직접 파이프**(libx264, preset veryfast). ffmpeg가 별도 vCPU에서 동시 인코딩.
- 장면별 세그먼트 mp4 → 전체 **concat + AAC** → 최종 H.264 mp4 → Storage → status=done.

### 3-6. 편집 — `/api/edit/scene`
- 장면 JSON(SceneSpec)만 수정 → **변경된 장면만 부분 재렌더**. 전체 재생성 금지(결정적 렌더 원칙).

---

## 4. 외부 API/솔루션 — 무엇을·어디서·왜

| API/솔루션 | 사용 위치 | 무엇을 | 비고 |
|---|---|---|---|
| OpenAI **gpt-image-2** | `/api/images`, `/api/admin/*-sample` | 장면 이미지, 로고 edit | low≈$0.02 / medium≈$0.06 / high≈$0.19. 한글 in-image 오타 거의 없음 |
| OpenAI **tts-1** | `/api/tts` | 나레이션 mp3 | 보이스 9종, $15/1M chars |
| OpenAI **gpt-4o** | `/api/script`, `/api/vision` | 원고, Vision 객체 분석 | Vision은 detail:high (bbox 정밀도). 기본 LLM |
| **Gemini 2.5 Flash** | `/api/script`, `/api/vision` | 원고/Vision 대체 | 키 있을 때만, 없으면 gpt-4o 폴백 |
| **Firebase Auth** | 모든 API(`authorizeRequest`) | ID 토큰 검증 | 내부 호출은 `x-internal-secret` |
| **Firestore** | 전역 | 상태/진행률/문서 | 프론트 실시간 구독 |
| **Firebase Storage** | images/tts/projects/logos | 파일 저장 | 공개 URL |
| **Cloud Run** | Worker | mp4 렌더 | 동기 렌더 + 오토스케일 |
| **Cloud Tasks** | `/api/render` → Worker | 렌더 비동기 전달 | 재시도/페이싱, dispatch 1800s |
| **music-metadata** | `/api/tts` | mp3 실제 길이 측정 | 타임라인 절대 기준 |

---

## 5. 최적화 정리 (각 최적화 → 효과)

| 최적화 | 어디 | 효과 |
|---|---|---|
| **raw RGBA → ffmpeg 파이프** (PNG 인코딩 제거) | Worker render.ts | 프레임 인코딩 병목(82%) 제거 → **렌더 9분→1.8분(5배)**, 무손실 |
| **preset veryfast + 4 vCPU** | Worker | 단일 렌더 추가 가속 |
| **Cloud Tasks 큐 + 동기 렌더** | /api/render, Worker | 동시 렌더가 한 인스턴스에 몰려 CPU 경쟁하던 문제 해소 → **렌더마다 인스턴스 분리, 세그먼트 12초 복귀** |
| **`--no-cpu-throttling`** | Cloud Run | 응답 외 구간 CPU throttle로 인한 hang 방지(과거 근본원인) |
| **sceneHash 세그먼트 캐시** | Worker | 안 바뀐 장면은 재렌더 스킵(부분 재렌더) |
| **이미지 생성 BATCH=4 병렬** | /api/generate | Tier 1 RPM 안전 스윗스팟에서 거의 비례 가속 |
| **TTS 동시 3개 + 멱등 재시도** | ProjectView | 실패분만 재시도, 빠른 합성 |
| **멱등 재개**(이미지/sceneSpec/audio 존재 시 스킵) | generate, tts | 중단 지점부터 재개, 중복 비용 0 |
| **TTS 길이 실측**(music-metadata) | /api/tts | 동기화 정확도(추정 3배 오차 제거) |
| **이미지 화질 선택**(low/med/high) | settings | 원가 통제 |
| **Vision anchor 강건 매칭** | planner | 나레이션-그림 시간 동기 정확 |

---

## 6. 동시성/병렬 모델

- **렌더**: Cloud Tasks(동시 6) → Cloud Run 오토스케일(인스턴스 6) → 렌더 1개=인스턴스 1개=4코어 독점. 6 초과분은 큐 대기. 검증: 3개 동시 → 인스턴스 3개 각 135~149s 완주.
- **이미지 생성**: 라우트 내부 BATCH=4 병렬(네트워크 바운드). 한도 = OpenAI Tier(증설로 확장).
- **TTS**: 클라이언트 동시 3개.
- **비용 중립**: 병렬은 총 vCPU·초 동일 → 시간만 단축. minScale=0이라 유휴 비용 0.

---

## 7. 비용 / 과금

- **영상 1편 원가**(low 2분 기준): 이미지+TTS ≈ **$0.33~0.5**, 렌더 compute ≈ **$0.01**(무시).
- **비용 추적**: `projects/{id}.costLog`(imageCostUsd/llmCostUsd/ttsCostUsd/renderSeconds).
- **과금**: `settings`의 토글 ON + 비면제 계정만 크레딧 차감. 게이트는 approve에서, 차감은 generate 완료 후 실비.

---

## 8. 보안 / 인증

- 모든 API: `authorizeRequest`로 **Firebase ID 토큰** 검증 + `ownsProject`로 소유권 확인.
- 내부 라우트 간 호출: `x-internal-secret`(INTERNAL_API_SECRET).
- Worker 공개 엔드포인트: **`x-worker-secret`(WORKER_SECRET)** 검증(Cloud Tasks가 헤더로 전달).
- 외부 API 키는 서버 env 전용, 클라이언트 노출 0.
- Firestore 규칙: 본인 프로젝트 doc만 쓰기, `renderJobs`/`settings`는 서버 전용.

---

## 9. 어드민 (`/admin/*`)
- **settings**: LLM 모델, 이미지 화질, 붓 프리셋(번짐/채움 게이지), 자막, 과금 토글.
- **brush**: 비용 0으로 드로잉 엔진 즉시 테스트(샘플 이미지 기반, mp4 다운로드, 비율/자막).
- **corporate(업소용 테스트)**: 영상 만들기 전 사명·로고가 이미지에 제대로 나오는지 단건 검증.
- **voices / members / videos / billing / sample-image**.

---

## 10. 데이터 모델 요약 (Firestore)
- `projects/{id}`: mode, sourceText, targetLength, aspect, stylePackId, voiceId, status, costLog, corporate?, thumbnailUrl?, cancelRequested?
  - `scenes/{id}`: order, narration, visualIntent, imageUrl, audioUrl, durationSec, imageStatus, **sceneSpec**(reveal/hand/canvas/subtitles)
- `renderJobs/{id}`: projectId, status(queued/running/done/error/cancelled), progress, outputUrl, costLog
- `settings/global`: llmModel, imageQuality, presets(붓), subtitles, billingEnabled
- `voices/{id}`, `users/{id}`(credits, billingExempt, role)

---

## 11. 운영 주의사항 (지뢰)
- **렌더 진행 중 Worker 재배포 금지** — in-flight 렌더가 죽는다.
- Worker 재배포 시 `--no-cpu-throttling --concurrency 1 --max-instances 6` **유지**.
- `renderCore.ts`는 **2벌**(`src/lib/render/`=프리뷰, `worker/src/render-engine/`=워커) — 동일하게 수정. 수정 시 worker `sceneHash v` 증가 + 재배포로 캐시 무효화.
- `next.config.ts`: `transpilePackages:["firebase-admin"]`(ESM) + `serverExternalPackages:["@google-cloud/tasks"]`(gRPC 동적 require) **제거 금지** — 빌드/런타임 깨짐.
- env 변경 시 dev 재시작. Vercel env 변경은 다음 배포부터 반영.
- gcloud 계정 = `funjejuai@gmail.com`, GCP 프로젝트 `golpo-b6407`.
- 렌더 큐 테스트: `node scripts/queue-test.mjs <projectId> [pid2 ..]`.
