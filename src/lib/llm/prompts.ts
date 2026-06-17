import { ProjectMode, TargetLength } from "@/lib/types";
import { sceneCountForLength } from "@/lib/length";

export function buildScriptPrompt({
  mode,
  topic,
  sourceText,
  targetLength,
  contentLocale,
}: {
  mode: ProjectMode;
  topic?: string;
  sourceText?: string;
  targetLength: TargetLength;
  contentLocale: string;
}) {
  const sceneCount = String(sceneCountForLength(targetLength));
  const langInstruction = contentLocale === "ko" ? "한국어로 작성하라." : `Write in ${contentLocale}.`;

  const commonInstruction = `
- 출력은 반드시 아래 JSON 형식만. 서문·마크다운·설명 일절 금지.
- scenes 배열의 각 항목: order(정수), narration(구어체 나레이션 문장), visualIntent(이 장면에서 보여줄 그림/도형/키워드 한 줄 묘사).
- 장면 수: 정확히 ${sceneCount}개. (총 ${targetLength}초 = 이미지 1장당 약 7초). 이 개수를 반드시 지켜라 — 목표 길이를 채우기 위한 핵심이다.
- **각 장면 나레이션은 한국어 48~56자, 2~3문장으로 작성하라.** 한 문장짜리 너무 짧은 나레이션 금지 — 한 장면을 약 7초간 판서로 그려야 하므로 그 시간을 채울 분량이 필요하다. (한국어 TTS 실측 약 7자/초 → 50자 ≈ 7초)
- **【매우 중요】 나레이션은 음성합성(TTS)으로 그대로 읽힌다. TTS는 띄어쓰기와 쉼표로만 끊어읽기를 판단하므로, 읽기 호흡이 정확히 보이도록 써라:**
  · **띄어쓰기를 표준 맞춤법대로 100% 정확히** — 붙여쓰기·오타가 있으면 TTS가 거기서 이상하게 끊거나 뭉갠다. (가장 흔한 prosody 사고 원인)
  · **호흡이 필요한 모든 지점에 쉼표(,)** — 긴 주어 뒤, 긴 수식어구 뒤, 접속어(그래서·하지만·즉·그러나) 앞뒤, 나열 사이. 한 문장이 길면 반드시 중간에 쉼표로 끊어라.
  · 문장은 너무 길게 늘이지 말고, 호흡 단위로 마침표(.)·물음표(?)를 적극 사용.
  · 단, 문어체로 어색할 만큼 과하게 찍지는 말 것 — "사람이 소리내어 읽을 때 쉬는 자리"에만.
  예) ✗ "물은항상위에서아래로흐르는데이것은중력때문입니다"  ✓ "물은 항상 위에서 아래로 흐릅니다. 그 이유는, 바로 중력 때문이죠."
- 한 장면은 하나의 완결된 소주제(핵심 메시지 1개)를 담는다. 짧은 문장 여러 개로 잘게 쪼개지 말고, 관련된 2~3문장을 묶어 한 페이지로 구성하라.
- visualIntent는 그 7초 동안 판서로 그릴 수 있는 복잡도로 묘사하라: 핵심 그림 1~2개 + 키워드 라벨 1~2개. 객체들은 서로 겹치지 않고 외곽선이 또렷한 형태여야 한다(펜이 윤곽을 따라 그려야 하므로).
- **title은 클릭을 부르는 강한 훅으로 작성하라**: 호기심을 자극하는 질문 또는 의외의 사실, 12~22자 내외로 짧고 강렬하게. 과장·낚시는 피하되 궁금하게. (영상 썸네일 중앙에 크게 들어가는 제목이며, 나레이션과 별개다.)
- **thumbnailHook**: 위 title보다 **더 짧고 더 자극적인** 썸네일 문구. **14자 이내**, 한눈에 꽂히게(예: "로마인의 충격 화장실", "나폴레옹은 안 작았다"). 클릭 유도가 최우선.
- **keySceneOrder**: scenes 중 **가장 임팩트가 강해 썸네일 배경으로 쓸 장면의 order 번호**(정수 1개). 시각적으로 강렬하거나 반전이 담긴 장면.
- ${langInstruction}

출력 형식:
{
  "title": "영상 제목",
  "thumbnailHook": "14자 이내 자극적 문구",
  "keySceneOrder": 3,
  "scenes": [
    { "order": 1, "narration": "...", "visualIntent": "..." }
  ]
}`;

  if (mode === "generate") {
    return `너는 교육 영상 원고 작가다. 주어진 주제로 드로잉-리빌 방식의 지식 전달 영상 원고를 작성하라.

주제: ${topic}
${commonInstruction}`;
  }

  return `너는 교육 영상 원고 작가다. 아래 원본 자료의 사실·논리·용어·전개 순서를 100% 보존하면서, 형식만 변환하라.
변환 규칙: 문어체→나레이션 구어체, 목표 길이에 맞게 축약/확장, 장면 분할, 장면별 시각화 의도 부여.
"내용 동결, 형식 변환" 원칙. 사실 추가·삭제·왜곡 금지.

원본 자료:
${sourceText}
${commonInstruction}`;
}
