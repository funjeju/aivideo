import { ProjectMode, TargetLength } from "@/lib/types";

const SCENE_COUNTS: Record<TargetLength, string> = {
  50: "7~10",
  180: "15~20",
  600: "30~45",
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
- 장면 수: ${sceneCount}개. 각 나레이션은 자연스러운 구어체로, 영상 나레이션으로 읽혔을 때 총 ${targetLength}초 분량이 되도록 조절.
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
