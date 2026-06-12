# TODO — 다음 세션 시작점

> 갱신: 2026-06-12 심야. 배포본 전체 동작 + 드로잉 엔진(v13)까지 완료된 상태.
> 상세 경위는 `history.md` 참조.

## ✅ 완료된 큰 덩어리 (요약)

- 배포 전체 동작: Vercel(앱) + Cloud Run Worker(mp4) + Firestore 규칙/인덱스 + API 인증(토큰+내부시크릿)
- 어드민: 대시보드/회원(크레딧·역할·과금면제)/영상/비용/보이스/시스템설정/**붓 테스트**
- 과금: 전역 토글(기본 OFF=전원무료) + billingExempt(naggu1999 면제) + 승인 게이트(402) + 실비 차감
- 사후 편집(문장수정/그림재생성) + 부분 재렌더(세그먼트 캐시, 28s→1.5s)
- 멀티 비율(9:16/16:9/1:1), 보이스 6종 + 미리듣기, 랜딩 페이지
- **드로잉 엔진 v13**: 전체 이미지 1회 분석→점-객체 1회 배정, 의미 순서 드로잉, 이어달리기 붓(30% 오버랩, 동시=붓개수), 객체 70% 타원 번짐 채움 + 전체 92% 전역 채움, 윤곽 추적 펜(가변두께/잉크튐/번짐/회전), 크기 0.3~6/개수 1~6/속도 0.05~4/표시 토글

## 🔴 다음 세션 우선 후보

- [ ] **붓 기본값 확정**: 사용자가 붓 테스트로 마음에 드는 조합(크기/개수/속도) 찾으면 → 시스템 설정 저장 → 실제 영상 1편 생성해 mp4 품질 확인
- [ ] (선택) 오버랩 비율(현재 renderCore OVERLAP=0.3 상수)을 어드민 슬라이더로
- [ ] **실전 영상 1편 엔드투엔드** (배포본에서 생성→mp4, ~$2): 새 Vision(anchorText)+새 드로잉으로 최종 품질 검증
- [ ] Vision bbox 정확도가 부족하면: detail 올리기/프롬프트 개선/객체 수 가이드

## 🟡 백로그

- [ ] 결제 연동 (현재 어드민 수동 크레딧 지급만)
- [ ] 한글 in-image 긴 문장 오타율 실측 (라벨은 오타 0 확인)
- [ ] LLM 파싱 실패 재시도, signup 페이지
- [ ] 자막/BGM, Style Pack Firestore 승격(템플릿 어드민 편집), draft-cheap 토글
- [ ] Firebase 키 재발급 (채팅 노출 이력)

## 환경 메모 (중요)

- **renderCore 수정 시**: Vercel 배포만으로 프리뷰/붓테스트/mp4 모두 반영. 단 **worker 세그먼트 캐시 무효화** 필요하면 `worker/src/render.ts`의 sceneHash `v:` 증가 + worker 재배포
- **worker 재배포**: `cd worker; gcloud run deploy aivideo-render-worker --source . --project golpo-b6407 --account funjejuai@gmail.com --region asia-northeast3 --memory 2Gi --cpu 2 --timeout 3600 --allow-unauthenticated --env-vars-file .env.cloudrun.yaml --quiet`
- gcloud 계정: funjejuai@gmail.com (golpo-b6407 권한 있음). 토큰 만료 시 `gcloud auth login`
- Vercel 내부 시크릿: INTERNAL_API_SECRET (로컬 .env.local 값과 Vercel 값이 다름 — 외부에서 배포본 internal 호출 시 Vercel 값 사용)
- ffmpeg: `C:\Users\funjeju\tools\ffmpeg-8.1.1-essentials_build\bin` (worker/.env)
- env 변경 시 dev 서버 재시작 (admin SDK 캐시)
- next.config의 `transpilePackages:["firebase-admin"]` **제거 금지** (Vercel ERR_REQUIRE_ESM)

## 유용한 스크립트 (scripts/)

| 스크립트 | 용도 |
|---|---|
| `test-render.mjs <projectId>` | Worker 렌더 직접 실행 → mp4 (dev 서버 필요, 캐시 변경 검증용) |
| `seed-test-project.mjs` | 비용 0 테스트 프로젝트 생성 |
| `watch-proj.mjs <projectId>` | 프로젝트 생성 진행 모니터 |
| `set-admin.mjs <email> <role>` | 권한 부여 |
| `test-indexes.mjs` / `test-firebase.mjs` | 인프라 확인 (무료) |
