@AGENTS.md

# CLAUDE.md

> 이 파일은 Claude Code가 매 세션 자동으로 읽는 진입점이다.
> **의도적으로 짧게 유지한다.** (세션 내내 상주하는 고정 토큰 비용이므로 — 200줄 이하 원칙)
> 상세 내용은 여기 쓰지 말고 `docs/`의 해당 파일을 그때그때 `@`로 열어 읽는다.

---

## 이 프로젝트가 무엇인가 (한 줄)

주제/자료를 입력하면 원하는 그림체(화이트보드·수묵담채·민화)의 지식 전달용 드로잉-리빌 영상을 자동 생성하는 교육·교양 특화 영상 SaaS. 벤치마크는 Golpo AI.

## 기술 스택 (요약)

- 프론트/짧은 API: **Next.js (App Router) on Vercel**
- 인증/DB/저장: **Firebase** (Auth / Firestore / Storage)
- 영상 렌더링: **Google Cloud Run** (Render Worker — 오래 걸리는 작업, Vercel 밖)
- 이미지: **OpenAI GPT Image 2** / 음성: **OpenAI TTS** (옵션 ElevenLabs) / 원고·연출: **LLM**
- UI: **shadcn/ui (MCP로 설치)** + 커스텀 디자인 토큰

## 명세 위치 — 필요할 때만 골라 읽어라 (토큰 절약)

전체 명세는 `docs/`에 있다. **통째로 읽지 말고**, `docs/00-README.md`의 색인을 먼저 보고 그 작업에 필요한 파일만 `@`로 연다.

| 무슨 작업이냐 | 읽을 파일 |
|---|---|
| 왜·무엇·누구 (방향 확인) | `@docs/01-core.md` |
| 시스템 구조·배포·env | `@docs/02-architecture.md` |
| DB 스키마·장면 JSON | `@docs/03-data-schema.md` |
| 생성 파이프라인 단계 | `@docs/04-pipeline.md` |
| 화면 색·폰트·컴포넌트 | `@docs/05-design-system.md` |
| 개발 순서(페이즈) | `@docs/06-phases.md` |
| 어드민·권한·보이스 | `@docs/07-admin.md` |
| **현재 전체 프로세스/API/최적화 한눈에** | `@docs/08-processes.md` |

> `docs/`의 PDF는 사람용 인쇄본이다. **Claude Code는 PDF를 읽지 마라** (md보다 토큰을 훨씬 많이 소비). 항상 md를 읽는다.

## 개발 순서

`@docs/06-phases.md`의 Phase 0 → 5 순서를 따른다. 한 번에 한 페이즈만. 페이즈를 건너뛰지 않는다.

## 진행 기록 (이 두 파일을 먼저 봐라)

- **`todo.md`** — 다음 세션 첫 작업·페이즈별 남은 일·스크립트 사용법·환경 메모
- **`history.md`** — 완료 내역, 발견·수정한 버그, 사용자와의 결정 사항. **주요 작업/대화마다 갱신할 것**

---

## 작업 규칙 (토큰·반복작업 최적화)

이 규칙들은 비용과 품질에 직접 영향을 준다. 지킨다.

### 컨텍스트 관리
- **작업 전환 시 `/clear`**: 무관한 작업으로 넘어갈 때 이전 컨텍스트는 토큰 낭비이자 품질 저하(context rot) 원인. 깨끗이 비우고 시작.
- **긴 작업은 `/compact`로 요약**: 한 작업이 길어지면 핵심(코드 변경·결정사항)만 남기고 압축.
- 필요한 파일만 연다. 폴더 전체를 컨텍스트에 올리지 않는다.
- 큰 명령 출력(빌드 로그 등)은 전체를 다시 읽지 말고 필요한 줄만 확인.

### 모델 선택 (3단계 에스컬레이션 — 2026.6 기준)

기본은 싼 모델, 막히면 한 단계씩 올린다. 무작정 올리면 비용만 낭비된다.

```
Sonnet 4.6  →  막히면 Opus 4.8  →  그래도 안 되면 Fable 5
 (주력 90%)      (난구간)            (최후의 보루, 드물게)
```

- **Sonnet 4.6 (주력)**: 대부분의 구현 — UI 컴포넌트, 폼, CRUD, Firestore 연동, 디자인 토큰 적용, 어드민 화면. Phase 0~1 대부분.
- **Opus 4.8로 올리는 신호**: ①같은 걸 2~3번 시켜도 계속 틀림 ②여러 파일이 얽혀 한 곳 고치면 다른 곳이 깨짐 ③에이전트성 멀티스텝 작업. → 우리 프로젝트에선 **Cloud Run 워커(Phase 3), 결정적 렌더 파이프라인, 파이프라인 오케스트레이션, 막히는 디버깅**.
- **Fable 5로 올리는 신호 (정말 드물게)**: 15분+ 장시간 작업, 섹션들이 서로 의존, 정답이 없어 깊은 단발 추론이 유리한 경우. → 현실적으로 **연출 계층(4대 Planner)의 LLM 기반 의미 동기화 고도화(Phase 5)** 정도만 해당.

> **올리기 전 자문**: 막히는 게 "추론 난이도" 문제인가, "정보 부족"(모호한 명세·미실측 사실) 문제인가? 정보 부족이면 모델을 올려도 똑같이 막힌다 → 사용자에게 결정을 요청하거나 사실을 먼저 확인할 것. 한글 오타율 같은 실측 이슈는 모델 격상으로 해결되지 않는다.

### 반복작업 최적화
- 같은 작업을 반복하면 **커스텀 슬래시 명령**이나 스크립트로 자동화 (예: 페이즈별 점검, 린트+타입체크).
- 새로 정한 패턴·규칙은 임시 채팅에 두지 말고 **이 CLAUDE.md나 해당 docs 파일에 짧게 기록**해 다음 세션이 재사용하게.
- 테스트·타입체크는 명령 한 줄로 돌릴 수 있게 `package.json` 스크립트로 정리.

### 결정적 렌더 원칙 (이 프로젝트 특유)
- 영상은 장면 JSON(Scene Spec)만 보고 만든다. 편집 = JSON 수정 + **변경된 장면만 부분 재렌더**. 전체 재생성 금지.

### 코드 위생
- 색은 항상 CSS 변수로 참조 (하드코딩 색상 금지 — 다크모드 토대).
- UI 문자열은 메시지 키로 분리 (하드코딩 한글 금지 — 다국어 토대).
- 외부 API 키는 클라이언트 노출 금지. 모든 외부 호출은 서버(API 라우트/Worker) 경유.

### 컴팩트 지침 (compact 시 보존할 것)
`/compact` 할 때는 다음을 우선 보존: 현재 페이즈와 완료/미완료 항목, 확정된 결정사항, 변경한 파일 목록, 다음 할 일.

---

## 메모 (세션 간 인계 — 여기에 짧게 갱신)

> 진행 상황을 한두 줄로 갱신해 다음 세션이 이어받게 한다. 길어지면 `docs/`로 옮긴다.

- 현재 상태: **Phase 0~4 완료 + 배포 전체 동작 + 배포본 영상 렌더 엔드투엔드 성공(2026-06-16)**. worker는 **node-canvas(@napi-rs/canvas) 직접 렌더**로 전환(Chrome/Puppeteer 제거). 막혔던 worker hang은 **Cloud Run CPU 스로틀링이 근본원인** → `--no-cpu-throttling`+`--concurrency 1` 재배포로 해결. **렌더 속도도 최적화**: 프레임 PNG인코딩(병목 82%) 제거 — raw RGBA를 ffmpeg stdin 직접 파이프+동시인코딩 → **9분→1.8분(5배)**, 출력 바이트 동일(무손실). 현재 rev 00030-bfj, sceneHash v27. 9장면 mp4(H.264 1080×1920+AAC 35s) 정상 검증. **드로잉 엔진 v15 "판서"**(잉크 이진화→Zhang-Suen 세선화→획 추출→객체별 획 순서 드로잉 + 영역 분할 채움). 어드민 `/admin/brush`에서 비용 0 즉시 테스트.
- 최근 결정: 드로잉=골격 획(stroke) 단위로 실제 선을 따라 그림(판서 느낌, TSP 점구름 폐기) / 객체별 영역 채움이 endAt에 100% 완성 보장(전역 92% 채움 삭제) / 나레이션 동기 모드(startAt 존재)에선 brushSpeed 무시 / 과금 토글 OFF 기본(naggu1999 면제)
- **렌더 동시성=Cloud Tasks 큐로 전환(2026-06-17, rev 00037-ztm)**: 워커 `/render`는 이제 **동기**(렌더 끝까지 응답 보류, 202 조기응답 폐기). `/api/render`는 직접 fetch 대신 **Cloud Tasks(render-queue, asia-northeast3)에 enqueue**만 하고 즉시 반환. 결과: concurrency=1+오토스케일로 **렌더마다 인스턴스 분리(4코어 독점)=진짜 병렬**, CPU 경쟁 해소(세그먼트 12초 복귀). 검증: 3개 동시→3 distinct 인스턴스 각 135~149s 완주. 공개 엔드포인트는 `x-worker-secret`(WORKER_SECRET, worker/.env.cloudrun.yaml + Vercel env)로 보호. `@google-cloud/tasks`는 next.config `serverExternalPackages`(번들 제외 필수). 테스트=`node scripts/queue-test.mjs <pid> [pid2..]`.
- 주의: `transpilePackages:["firebase-admin"]` 제거 금지(Vercel ESM) / `serverExternalPackages:["@google-cloud/tasks"]` 제거 금지(gRPC 동적 require 빌드 실패) / renderCore 수정 시 worker sceneHash v 증가+worker 재배포로 캐시 무효화 / env 변경 시 dev 재시작 / gcloud=funjejuai 계정 / **worker 재배포 시 `--no-cpu-throttling --concurrency 1 --max-instances 6` 유지** / **렌더 진행 중 worker 재배포 금지**(in-flight 렌더 죽음)
- **런칭 준비(2026-06-17 추가)**: ①훅 썸네일 자동화(script LLM이 thumbnailHook+keySceneOrder 생성→완료 시 자동 합성, ProjectView에서 문구·장면 수정 가능) ②아웃트로(영상 끝 ~2.5s 브랜드 카드+TTS 멘트, 어드민 `/admin/outro`에서 토글/문구/음성. settings/global.outro, 워커가 concat 끝에 append, sceneHash 무관). worker rev **00038-6zx**. 브랜드명 가안 **easyshorts**(미확정). 검증: 31.56s=장면29.5+아웃트로2.5 확인.
- 다음 할 일: ①**메인페이지 보완**(템플릿 갤러리 12종 클릭→이미지+유튜브임베드, 목소리 샘플, 작동방식 강화 — 유튜브 unlisted/public ID는 사용자 업로드 후 채움) ②업소 사진→화풍 변환(todo 상단) ③붓 기본값 확정 ④브랜드명 확정 후 DrawNarrate→easyshorts 치환
- 붓 자동화: 붓 9종+도구 5종+흐름 2종 전부 settings/global로 저장→자동 생성에 적용. worker 현재 rev 00037-ztm(node-canvas, 동기렌더, Cloud Tasks 큐, no-cpu-throttling, raw 파이프).
