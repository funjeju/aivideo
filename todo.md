# TODO — 다음 세션 시작점

> 갱신: 2026-06-12 밤. 전반 로직 검토 + 버그 5건 수정까지 완료된 상태.

## 🔴 즉시 (다음 세션 첫 작업)

- [ ] **(사용자) Firestore 복합 인덱스 2개 생성** — 없으면 대시보드/렌더 진행률이 조용히 실패
  - 링크는 `node scripts/test-indexes.mjs` 실행하면 에러 메시지에 출력됨 (history.md "전반 로직 검토" 섹션에도 있음)
  - 생성 후 같은 스크립트로 ✅ 확인
- [ ] **브라우저 UI 전체 흐름 검증** — 로그인 → 생성 → 원고 승인 → 이미지 생성 → 프리뷰 → mp4 (이미지 수장 생성으로 ~$1.5 비용, 사용자 승인 후 진행)
  - 사전: dev 서버 + worker 서버 둘 다 실행, `.env.local`에 `RENDER_WORKER_URL=http://localhost:8080`
  - Firebase 콘솔에서 Auth Google/이메일 로그인 활성화 확인 필요

## 🟡 Phase 4 (편집 + 과금 + 어드민)

- [ ] Step 8 사후 편집: "이 그림 다시 / 이 문장 수정 / 순서·길이 변경" → 부분 재렌더(`type: "partial"`)
- [ ] **API 인증 추가** — 현재 전부 무인증(ownerId를 클라이언트가 보냄). Firebase ID 토큰 검증 미들웨어 + Firestore 보안 규칙 작성. **배포 전 필수**
- [ ] `/admin` 세션 쿠키(`__session`) 설정 로직 (로그인 시 ID 토큰 → 쿠키)
- [ ] 크레딧/과금: costLog 기반 차감, 플랜별 한도
- [ ] 어드민 화면 구현 (회원/영상/비용/보이스/템플릿) — 현재 골격만
- [ ] Style Pack을 Firestore `stylePacks` 컬렉션으로 승격
- [ ] 멀티 비율 출력 (9:16/16:9/1:1) — 현재 planner가 9:16 고정
- [ ] draft-cheap 토글 (low/medium 프리뷰 → high 확정)

## 🟢 배포 시점에

- [ ] Vercel 배포 + 환경변수 주입
- [ ] Cloud Run Worker 배포 (`worker/README.md`의 gcloud 명령) → `RENDER_WORKER_URL` 갱신
- [ ] approve→generate fire-and-forget을 **Cloud Tasks로 전환** (Vercel 함수 조기 종료 위험)
- [ ] `RENDER_PAGE_URL`을 Vercel URL + `/render`로
- [ ] Firebase 키 재발급 검토 (채팅에 노출됐었음)

## 🔵 품질 개선 (Phase 5 영역, 급하지 않음)

- [ ] bbox 사각형 clip 경계가 보임 → 객체 외곽 따라 부드러운 리빌 (페더링/브러시 마스크)
- [ ] 붓/손 그래픽 다듬기 (현재 단순 도형)
- [ ] 한글 in-image 긴 문장 오타율 실측 (라벨 "한계효용"은 오타 0 확인됨, 문장 단위는 미검증)
- [ ] LLM 파싱 실패 시 재시도 로직
- [ ] signup 페이지 (현재 Google 로그인만 동작)
- [ ] 4대 Planner LLM 기반 의미 동기화 (규칙 → 지능형)

## 현재 동작 상태 요약

- ✅ 전체 파이프라인 코드 완성 + 로컬 엔드투엔드 검증 (실제 mp4 생성 확인)
- ✅ 한글 in-image 라벨 오타 0 (gpt-image-2) — 1순위 리스크 해소 신호
- ✅ 버그 5건 수정·검증 (TTS 길이 실측, Storage 버킷, users upsert, 이미지 에러 기록, 비용 집계)
- ⏸ 인덱스 2개만 생성되면 UI 구독까지 완전 동작

## 유용한 스크립트 (scripts/)

| 스크립트 | 용도 |
|---|---|
| `test-firebase.mjs` | Firestore/Storage 연결 확인 (무료) |
| `test-indexes.mjs` | 복합 인덱스 존재 확인 (무료) |
| `test-script.mjs` | LLM 원고 생성 (~$0.006) |
| `test-tts-route.mjs` | /api/tts 회귀 테스트 (~$0.001, dev 서버 필요) |
| `test-image.mjs` | gpt-image-2 한글 이미지 (~$0.19) |
| `seed-test-project.mjs` | 비용 0 테스트 프로젝트 생성 (기존 자산 재활용) |
| `test-render.mjs <projectId>` | Worker 렌더 직접 실행 → mp4 (dev 서버 필요) |
| `set-cors.mjs` | GCS CORS 설정 (적용 완료됨) |

## 환경 메모

- ffmpeg: `C:\Users\funjeju\tools\ffmpeg-8.1.1-essentials_build\bin` (worker/.env에 경로 설정됨)
- worker 로컬 실행: `cd worker && npm run dev` (포트 8080)
- dev 서버 재시작 시 admin SDK 인스턴스 캐시 주의 (env 변경 시 재시작 필수)
