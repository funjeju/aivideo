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

## ✅ 해결됨 (2026-06-16 — worker 렌더 전환 + hang 근본원인)

**배경**: Cloud Run에서 headless Chrome(Puppeteer)이 안 뜸(gVisor socket/NETLINK 실패). 9번 시도 실패 → **Chrome 제거하고 node-canvas(@napi-rs/canvas)로 전환**. 전환 후에도 worker가 progress 0에서 timeout → **근본원인은 코드가 아니라 Cloud Run CPU 스로틀링이었음.**

**🔑 근본원인**: index.ts가 202를 먼저 응답(`res.end`)하고 무거운 렌더를 그 다음에 시작하는 fire-and-forget 패턴. Cloud Run 기본값은 **요청 응답 후 CPU를 ~0으로 throttle** → 응답 뒤 시작되는 렌더가 거의 안 돌아 timeout. 로컬은 멀쩡하니 코드만 의심하느라 오래 막힘.

**조치**: `--no-cpu-throttling`(CPU 항상 할당) + `--concurrency 1`(인스턴스당 렌더 1개=풀CPU)로 재배포. **revision 00028-9fz**.

**검증 완료(2026-06-16)**: render-test.mjs로 테스트 프로젝트(yPnz64wkmJi1XVXUFLls, 9장면) 렌더 → **status done, progress 0→9→…→100, 총 ~535s(9분)**. 출력 mp4 ffprobe 검증: **H.264 1080×1920 + AAC, 35.0초, 5.2MB = 정상 재생 가능본.** node-canvas 전환 이후 배포본에서 영상이 처음으로 끝까지 생성됨.

**부수 정리(커밋 필요)**: render.ts에 단계별 진단 로그 추가 / Dockerfile에서 죽은 puppeteer+chrome 설치 제거(다음 빌드부터 훨씬 빠름) / package.json puppeteer 의존성 제거.

**관련 커밋(전환 과정)**:
- `77feb61` renderCore 캔버스 백엔드 주입 추상화 / `c00557c` render-engine 격리+PoC / `a51ee63` render.ts node-canvas 교체 / `8809ac1` blur 사전계산+shadow 제거(로컬 53→27s/장면, sceneHash v26)

## ✅ 렌더 속도 최적화 완료 (2026-06-16 — 9분→1.8분, 5배)

**측정으로 병목 특정**(worker/measure-frame.mjs): 프레임당 renderSceneFrame=39ms vs **toBuffer(PNG)=182ms(전체 82%)**, raw 추출=0ms. 실제 그리기가 아니라 PNG 인코딩이 병목이었음.

**해결**: 프레임을 PNG로 디스크에 안 쓰고 **raw RGBA 픽셀(`canvas.data()`)을 ffmpeg stdin에 직접 파이프**(render.ts renderSegment). PNG인코딩+디스크I/O 제거 + ffmpeg(libx264)가 별도 프로세스로 남는 vCPU에서 **동시 인코딩**(렌더와 병렬). canvas.data()=RGBA 순서, Buffer.from 복사 필수(stream.write는 참조만 보관), 백프레셔 drain 처리.

**검증**: 로컬 test-pipe.mjs(123프레임 27s→6.2s, 색/길이 정상) → Cloud Run rev 00030-bfj 실측 **535s→106s**. 출력 mp4 **바이트 동일**(5,200,779) = 품질 그대로. sceneHash v27.

**추가 여지(필요시)**: 세그먼트 인코딩 Cloud Run ~10s/장면(로컬 6s). ffmpeg preset medium→veryfast면 더 빠름(파일 약간↑). 해상도/fps는 품질 민감 — 최후.

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
- **worker 재배포**: `cd worker; gcloud run deploy aivideo-render-worker --source . --project golpo-b6407 --account funjejuai@gmail.com --region asia-northeast3 --memory 4Gi --cpu 2 --timeout 3600 --no-cpu-throttling --concurrency 1 --allow-unauthenticated --env-vars-file .env.cloudrun.yaml --quiet`
  - ⚠️ **`--no-cpu-throttling` 절대 빼지 마라**: 워커는 202 응답 후 비동기로 렌더한다(fire-and-forget). 이 플래그 없으면 응답 후 CPU가 throttle돼 progress 0에서 timeout(2026-06-16 hang 근본원인). `--concurrency 1`은 렌더 1건이 인스턴스 풀CPU 쓰게.
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
