import { ProjectMode, TargetLength } from "@/lib/types";

// 판서 1페이지 = 약 10초(나레이션 40~48자) 기준. 그림을 그릴 시간을 확보한다.
const SCENE_COUNTS: Record<TargetLength, string> = {
  50: "5",
  180: "18",
  600: "60",
};

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
  const sceneCount = SCENE_COUNTS[targetLength];
  const langInstruction = contentLocale === "ko" ? "한국어로 작성하라." : `Write in ${contentLocale}.`;

  const commonInstruction = `
- 출력은 반드시 아래 JSON 형식만. 서문·마크다운·설명 일절 금지.
- scenes 배열의 각 항목: order(정수), narration(구어체 나레이션 문장), visualIntent(이 장면에서 보여줄 그림/도형/키워드 한 줄 묘사).
- 장면 수: ${sceneCount}개. (총 ${targetLength}초 = 장면당 약 10초)
- **각 장면 나레이션은 한국어 40~48자, 2~3문장으로 작성하라.** 한 문장짜리 너무 짧은 나레이션 금지 — 한 장면을 약 10초간 판서로 그려야 하므로 그릴 시간이 필요하다. (한국어 성우 약 4.3자/초 → 45자 ≈ 10초)
- 한 장면은 하나의 완결된 소주제를 담는다. 짧은 문장 여러 개로 잘게 쪼개지 말고, 관련된 2~3문장을 묶어 한 페이지로 구성하라.
- visualIntent는 그 10초 동안 판서로 그릴 수 있는 복잡도(핵심 그림 1개 + 키워드/라벨 몇 개)로 묘사하라.
- ${langInstruction}

출력 형식:
{
  "title": "영상 제목",
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
