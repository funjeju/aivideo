# 04 · PIPELINE — 생성 파이프라인 단계별 계약

> 주제/문서 입력부터 mp4까지. 각 단계의 **입력 → 처리 → 출력**을 계약처럼 명시.
> 단계 경계에서 데이터는 항상 `03-data-schema.md`의 구조로 직렬화된다.

---

## 전체 흐름

```
Step 1  입력 수집        → projects 문서 생성 (mode, targetLength, stylePackId, voiceId)
Step 2  원고+장면분할    → scenes 초안 (narration, order)         [LLM]
Step 3  TTS 합성         → audioUrl, durationSec 확정              [OpenAI TTS]
─────── 원고 승인 체크포인트 (사용자) : status = approved ───────
Step 4  이미지 생성      → image.url (장면당 1~2장, 병렬)          [GPT Image 2]
Step 5  Vision 분석      → reveal.objects[].bbox/role             [Vision]
Step 6  연출 계획        → revealOrder/strokeStyle/flow/startAt   [4대 Planner = LLM+규칙]
Step 7  렌더링           → mp4                                     [Cloud Run Worker]
Step 8  사후 편집        → 변경 장면만 Step 4~7 부분 재실행
```

---

## Step 1 · 입력 수집
- **입력**: 모드(generate/faithful), 주제 텍스트 또는 업로드 파일, 길이(50/180/600초), Style Pack, 보이스, 콘텐츠 언어(contentLocale).
- **보이스 선택 시 미리듣기 제공**: 각 보이스 카드의 ▶ 버튼으로 `voices/{id}.previewUrl` 재생. ElevenLabs는 제공 preview URL, OpenAI는 캐싱된 샘플 문장 오디오. (상세 `07-admin.md` 3절)
- **처리**:
  - faithful: 업로드 파일(PDF/DOCX/TXT/MD)에서 텍스트 추출 → `sourceText` 저장.
  - generate: `sourceText` 비움.
- **출력**: `projects/{id}` 문서, `status: "draft"`.

---

## Step 2 · 원고 + 장면 분할 (LLM)
- **입력**: 모드, sourceText(또는 주제), targetLength.
- **처리** — 모드별 프롬프트 분기:
  - **generate**: 주제로부터 목표 길이에 맞는 원고를 새로 작성.
  - **faithful**: sourceText의 **사실·논리·용어·전개 순서를 보존**하며 형식만 변환(구어체화 + 길이 맞춤 축약/확장).
  - 공통: 원고를 장면 단위로 분할. 각 장면에 ①나레이션 문장 ②시각화 의도(어떤 그림/라벨/도형) 부여.
  - 장면 수 가이드: 50초≈7~10, 3분≈15~20, 10분≈30~45 (나레이션 길이가 최종 결정).
- **출력**: `scenes/{id}` 초안들 (`order`, `narration`, 임시 `sceneSpec.reveal` 의도 메모). `status: "script_ready"`.
- **LLM 출력 형식**: 반드시 JSON만 반환(서문/마크다운 금지). 파싱 실패 시 재시도.

```jsonc
// LLM 기대 출력
{
  "title": "선택의 역설",
  "scenes": [
    { "order": 1, "narration": "...", "visualIntent": "갈림길 하나가 나타난다" },
    { "order": 2, "narration": "...", "visualIntent": "갈림길이 여러 개로 늘어난다" }
  ]
}
```

---

## Step 3 · TTS 합성 (OpenAI TTS)
- **입력**: 각 장면 `narration`, `voiceId`.
- **처리**: 장면별 음성 합성 → 오디오 길이 측정.
- **출력**: `scenes.audioUrl`, `scenes.durationSec`. **이 durationSec가 타임라인의 절대 기준**(영상 길이는 오디오에 종속).
- 비용: `costLog.ttsCharCount/ttsCostUsd` 기록.

---

## ★ 원고 승인 체크포인트 (사용자)
- 프론트는 title + 장면별 narration + visualIntent를 보여주고 **승인/수정** 받음.
- 수정은 텍스트 편집만 → 해당 장면 Step 3만 재실행(저비용). **이미지 생성 전이므로 진짜 비용 0.**
- 승인 시 `scriptApproved: true`, `status: "approved"`. 이후 단계는 자동 진행.

---

## Step 4 · 이미지 생성 (GPT Image 2)
- **입력**: 장면 `visualIntent` + Style Pack `imagePrompt.template`(subject 치환) + `size`(aspect 정합).
- **처리**:
  - 장면당 이미지 1~2장 **병렬 생성**.
  - `textStrategy`에 따라: in-image면 프롬프트에 라벨 텍스트 포함, overlay면 텍스트 제외(렌더 단계에서 폰트로), hybrid면 곡면/사물 텍스트만 포함.
  - 실패/저품질 컷은 해당 장면만 자동 재생성(최대 N회).
- **출력**: `scenes.image.url`, `imageStatus: "done"`.
- 비용: `costLog.imageCount/imageQuality/imageCostUsd/imageRegenerations` 기록.
- **주의**: 화풍 일관성용 레퍼런스 이미지를 매 컷에 넣으면 편집 토큰 과금으로 2~3배 비싸짐 → 기본은 레퍼런스 없이, 캐릭터 반복 서사 모드에서만 사용.

---

## Step 5 · Vision 분석
- **입력**: 생성된 장면 이미지.
- **처리**: 이미지 내 요소의 bounding box + 역할(title/label/illustration/arrow/shape) 추출. (Vision 모델 또는 경량 CV)
- **출력**: `sceneSpec.reveal.objects[].bbox/role`.

---

## Step 6 · 연출 계획 (4대 Planner)
연출 계층. LLM(대본-객체 의미 매핑) + 규칙(Style Pack `plannerDefaults`)의 조합.
- **Reveal Planner**: narration 흐름과 객체 의미를 대조해 `revealOrder` 결정. (예: "먼저 지구 전체를" → 지구본 객체 먼저)
- **Stroke Planner**: 객체별 `strokeStyle`(brush/outline/fill) — Style Pack 기본값 기반.
- **Flow Planner**: `flowDirection` — Style Pack 기본값(수묵=우→좌) 기반.
- **Sync Planner**: 각 객체 `startAt/endAt`을 narration 타이밍에 정렬. `rhythm`(slow-breath/fast-beat)이 간격 조절.
- **출력**: `sceneSpec.reveal.objects[]` 완성 + `camera`/`overlays`/`hand`.

> Planner는 처음엔 **규칙 기반(Style Pack 기본값)**으로 충분히 동작. 이후 LLM 기반 의미 동기화로 고도화(점진적). 이 계층이 제품의 차별화 해자.

---

## Step 7 · 렌더링 (Cloud Run Render Worker)
- **입력**: 프로젝트의 모든 Scene Spec + 이미지/오디오 URL.
- **처리**: `02-architecture.md` 4절. 장면별 마스크 리빌 + 손 애니메이션 + 카메라 + 오버레이 → 오디오 합성 → ffmpeg mp4 인코딩. Seeded Random으로 결정적.
- **출력**: `renderJobs.outputUrl`(Storage mp4), `status: "done"`, `progress: 100`.
- 프론트는 `renderJobs/{jobId}`를 실시간 구독해 진행률 표시.
- 비용: `costLog.renderSeconds/renderCostUsd/totalCostUsd` 기록.

---

## Step 8 · 사후 편집
- "이 그림 다시": 해당 장면 Step 4 재실행 → Step 7 부분 재렌더(`type: "partial"`, 해당 sceneId만).
- "이 문장 수정": 해당 장면 Step 2(텍스트)·3(TTS) 재실행 → 필요 시 이미지 재생성 여부 사용자 확인 → 부분 재렌더.
- "순서/길이 변경": Scene Spec의 order/timing만 수정 → 부분 재렌더.
- 결정적 렌더 덕분에 **변경 안 된 장면은 재계산 없음** → 편집 비용 최소.

---

## 비용 최적화 레버 (구현에 반영)
1. **draft-cheap, finalize 옵션(선택)**: 사용자가 원하면 low/medium 품질로 빠른 미리보기 → 확정 시 high 재생성. 단 기본 플로우는 원샷 high(저마찰 우선). 토글로 제공.
2. **장면당 이미지 1장 원칙** + 레퍼런스 미사용 → 숏폼 원가 $1.5~2 안정.
3. **부분 재렌더** → 편집 시 전체 재생성 방지.
4. 모든 단계 비용을 `costLog`에 적재 → 크레딧 차감·마진 산출.
