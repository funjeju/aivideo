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

## 🔴🔴 최우선 (2026-06-16 진행 중 — worker 렌더 전환)

**배경**: Cloud Run에서 headless Chrome(Puppeteer)이 안 뜸(gVisor에서 socket/NETLINK 실패). 9번 시도 실패 → **Chrome 제거하고 node-canvas(@napi-rs/canvas)로 전환** 결정·구현함.

**완료(커밋됨)**:
- `77feb61` renderCore에 캔버스 백엔드 주입 추상화(configureCanvasBackend) — 브라우저 무영향
- `c00557c` worker/src/render-engine/에 renderCore·seededRandom·types 격리 복사(import .js, @/lib/types→로컬), @napi-rs/canvas 설치, PoC로 node 렌더 검증(페이드/blur/한글 OK)
- `a51ee63` render.ts를 Puppeteer→node-canvas로 교체 + index.ts storageBucket 픽스
- `8809ac1` 성능: 영역 blur 사전계산 캐시 + round shadowBlur 제거(Skia CPU에서 그림자가 렌더 2배). **로컬 53s→27s/장면**. worker sceneHash v26.

**막힌 지점(다음 세션 시작점)**:
- 로컬(Windows) 프레임 렌더 = 26초/장면(123프레임). 근데 **worker(gen1 4Gi)에선 여전히 progress 0으로 10분+ timeout**.
- worker 로그에 진행/에러 없음(renderSegment에 console.log 없어서 깜깜).
- **로컬엔 ffmpeg가 없어 frames→mp4 합성 단계는 미검증 = 사각지대**. 여기가 hang 의심 1순위.
- **다음 수**: worker render.ts에 단계별 console.log(이미지fetch완료/프레임N/ffmpeg시작·완료) 추가 재배포 → 첫 세그먼트가 어디서 멈추는지 확인. ffmpeg hang인지, gen1 렌더가 로컬보다 훨씬 느린건지 특정.
- 배포 리비전 00027-kn8(node-canvas v26)이 현재 traffic. 롤백하려면 이전 리비전.
- 검증 도구: `node scripts/render-test.mjs <projectId>` (renderJob 생성+worker호출+폴링), `node scripts/diag.mjs <projectId>` (상태덤프). worker/poc-frame.mjs(로컬 프레임 렌더 시간측정).
- 추가 최적화 여지(필요시): 채움/합성도 매 프레임 누적(21s)→ 누적 마스크 or 해상도/fps. 단 품질 민감 — 해상도/fps는 최후.
- 정리 안 한 것: Dockerfile에 puppeteer/chrome 설치 잔존(빌드 느림, 동작 무관) — 전환 확정되면 제거. package.json puppeteer 의존성도.

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
