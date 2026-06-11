# 03 · DATA SCHEMA — Firestore 스키마와 장면 JSON 명세서

> 이 시스템의 **단일 진실 소스(single source of truth)는 Scene Spec(장면 JSON)**이다.
> 렌더러는 오직 이 JSON만 보고 영상을 만든다. 편집 = JSON 수정 + 부분 재렌더.

---

## 1. Firestore 컬렉션 구조

```
users/{userId}
  · email, displayName, plan, credits, createdAt
  · role               "user" | "staff" | "superadmin"  (기본 "user", 어드민 권한 — 07-admin.md)
  · uiLocale           UI 언어 (예: "ko" | "en")          (다국어 토대 — 05-design-system.md)
  · themePref          "light" | "dark" | "system"        (다크모드 토글 — 05-design-system.md)

projects/{projectId}
  · ownerId            (= userId)
  · title
  · mode               "generate" | "faithful"
  · sourceText         (충실 모드: 추출된 원문 / 생성 모드: 비움)
  · sourceFileUrl      (충실 모드 업로드 파일)
  · targetLength       50 | 180 | 600   (초)
  · stylePackId        "whiteboard" | "ink-wash" | "minhwa"
  · voiceId            (TTS 보이스 식별자 — voices 컬렉션 참조)
  · contentLocale      영상 콘텐츠 언어 (나레이션/자막/in-image 텍스트). 기본 "ko"
  · status             "draft"|"script_ready"|"approved"|"generating"|"rendering"|"done"|"error"
  · scriptApproved     boolean
  · createdAt, updatedAt

  scenes/{sceneId}              (projects 하위 서브컬렉션)
    · order               정수 (장면 순서)
    · narration           string (해당 장면 나레이션 텍스트)
    · durationSec         number (TTS 오디오 길이 기준)
    · sceneSpec           object  ← 아래 2절 Scene Spec
    · imageUrl            Storage URL (생성된 장면 이미지)
    · imageStatus         "pending"|"done"|"error"
    · audioUrl            Storage URL (장면 나레이션 오디오)

renderJobs/{jobId}
  · projectId
  · ownerId
  · type                "full" | "partial"
  · sceneIds            string[]  (partial일 때 대상 장면)
  · status              "queued"|"running"|"done"|"error"
  · progress            0~100
  · outputUrl           완성 mp4 Storage URL
  · costLog             object  ← 5절 비용 로깅
  · createdAt, updatedAt

stylePacks/{packId}            (어드민이 코드 배포 없이 편집 — 07-admin.md 2.3)
  · 3절 Style Pack 스키마 전체
  · enabled             boolean (비활성 시 사용자 선택에서 숨김)
  · thumbnailUrls       string[] (사용자 화풍 선택 화면 미리보기)
  · sortOrder, badge    노출 순서 / "new"|"beta"

voices/{voiceId}               (나레이션 보이스 풀 — 07-admin.md 3절)
  · provider            "elevenlabs" | "openai"
  · providerVoiceId, displayName, language, gender, tags[]
  · previewUrl          미리듣기 오디오 (EL: 제공 URL / OpenAI: 캐싱 샘플)
  · enabled, tier       "free" | "premium"
```

---

## 2. Scene Spec (장면 JSON) — 렌더러의 입력

장면 하나를 영상으로 만드는 데 필요한 모든 정보. **렌더러는 이 구조만 해석한다.**

```jsonc
{
  "sceneId": "s_03",
  "order": 3,
  "durationSec": 6.4,                  // TTS 오디오 길이가 결정 (타임라인의 절대 기준)
  "narration": "선택이 많아질수록 사람은 더 혼란스러워집니다.",
  "audioUrl": "https://.../s_03.mp3",

  "canvas": {
    "aspect": "9:16",                  // "9:16" | "16:9" | "1:1" (길이/플랫폼별)
    "background": "paper-hanji"        // Style Pack이 지정하는 배경 레이어
  },

  "image": {
    "url": "https://.../s_03.png",     // GPT Image 2 생성 결과 (텍스트 포함 가능)
    "fit": "contain"
  },

  // 연출 계층의 출력 — 4대 Planner 결과가 여기에 직렬화됨
  "reveal": {
    "objects": [                       // Vision 분석으로 잡은 객체 + 공개 계획
      {
        "id": "obj_crossroad",
        "bbox": [120, 300, 680, 900],  // [x1,y1,x2,y2] (캔버스 좌표)
        "role": "illustration",        // "title"|"label"|"illustration"|"arrow"|"shape"
        "revealOrder": 1,              // Reveal Planner: 몇 번째로 공개
        "strokeStyle": "brush",        // Stroke Planner: 내부 생성 방식
        "flowDirection": "left-to-right", // Flow Planner: 마스크 제거 방향
        "startAt": 0.3,                // Sync Planner: 시작 시각(초)
        "endAt": 3.0                   // 공개 완료 시각(초)
      }
    ]
  },

  "camera": [                          // 선택: 줌/패닝 키프레임
    { "at": 0.0, "scale": 1.0, "x": 0, "y": 0 },
    { "at": 4.0, "scale": 1.2, "x": 100, "y": 0 }
  ],

  "overlays": [                        // Style Pack 고정 레이어 (한지/낙관/여백 등)
    { "type": "texture", "asset": "hanji.png", "opacity": 0.15 },
    { "type": "stamp", "asset": "nakgwan.png", "pos": [900, 1500], "at": "end" }
  ],

  "hand": {                            // 손 애니메이션 (그리는 효과)
    "enabled": true,
    "asset": "brush-hand"              // Style Pack별 도구(붓/펜/분필)
  }
}
```

### 필드 출처 매핑 (어느 단계가 무엇을 채우는가)
- `narration`, `durationSec`, `audioUrl` ← 원고/TTS 단계 (`04-pipeline.md` Step 2~3)
- `image.url` ← 이미지 생성 단계 (Step 4)
- `reveal.objects[].bbox/role` ← Vision 분석 (Step 5)
- `reveal.objects[].revealOrder/strokeStyle/flowDirection/startAt/endAt` ← 4대 Planner (Step 6)
- `canvas.background`, `overlays`, `hand.asset` ← Style Pack 정의 (아래 3절)

---

## 3. Style Pack 스키마

화풍 1종의 완전한 정의. `lib/style-packs/`에 코드+에셋으로 존재.

```jsonc
{
  "id": "ink-wash",
  "name": "수묵담채",
  "description": "한지 위 먹선과 담채. 심리·철학·역사 콘텐츠용.",

  "imagePrompt": {
    "template": "korean ink wash painting (sumukhwa), {subject}, soft diffused ink, light color accents, generous negative space, hanji paper texture, minimal, elegant",
    "negative": "photorealistic, 3d render, neon, heavy saturation",
    "model": "gpt-image-2",
    "quality": "high",
    "size": "1024x1536"               // 길이/비율은 canvas.aspect와 정합
  },

  "textStrategy": "hybrid",           // "in-image" | "overlay" | "hybrid"
                                      // hybrid: 곡면/사물 텍스트는 이미지, 평면 제목/라벨은 폰트 오버레이
  "fontTitle": "붓글씨 계열 (예: 나눔붓체)",
  "fontLabel": "Pretendard",

  "overlays": [
    { "type": "texture", "asset": "hanji.png", "opacity": 0.15 },
    { "type": "stamp", "asset": "nakgwan.png", "trigger": "end" }
  ],

  "plannerDefaults": {                // 4대 Planner 기본 파라미터
    "revealStyle": "symbol-first",    // 핵심 상징 먼저
    "strokeStyle": "brush",           // 붓 흐름 따라 등장
    "flowDirection": "right-to-left", // 동양화 독해 방향
    "rhythm": "slow-breath",          // 여백 유지, 느린 호흡
    "handTool": "brush"
  },

  "palette": { "ink": "#2A2A2E", "accent": "#3A6B5C", "paper": "#FAF8F4" },

  "userSliders": {                    // 사용자 미세 조절 (저마찰 유지: 최대 2~3개)
    "colorTemperature": { "min": -1, "max": 1, "default": 0 },
    "whitespaceDensity": { "min": 0, "max": 1, "default": 0.6 }
  }
}
```

> 초기 3팩(`whiteboard`, `ink-wash`, `minhwa`)은 동일 스키마로 정의. **정보 구조 문법(role 종류·연출 계층)은 공유**, 위 값만 다름.

---

## 4. 비율(aspect) 처리 주의 (검증된 제약)

- GPT Image 2 공식 지원 해상도는 1024×1024 / 1024×1536 / 1536×1024 3종(2026 기준).
- **1536×1024는 3:2이지 4:3이 아니다.** 4:3/3:4가 꼭 필요하면 생성 후 크롭 또는 4:3 지원 서드파티 경유 필요.
- **9:16 숏폼**: 1024×1536(2:3) 생성 후 상하 확대 크롭 또는 상하 여백 연출. `canvas.aspect`와 이미지 `size`의 정합 로직을 파이프라인에 둘 것.

---

## 5. 비용 로깅 (renderJobs.costLog)

영상 1편의 외부 API 원가를 추적 (CORE 원칙 5).

```jsonc
{
  "imageCount": 8,
  "imageQuality": "high",
  "imageCostUsd": 1.32,
  "imageRegenerations": 1,
  "ttsCharCount": 820,
  "ttsCostUsd": 0.01,
  "llmCostUsd": 0.25,
  "renderSeconds": 95,
  "renderCostUsd": 0.04,
  "totalCostUsd": 1.62
}
```

> 이 로그로 크레딧 차감량과 마진을 산출. 사용자별/플랜별 원가 대시보드의 기초 데이터.
