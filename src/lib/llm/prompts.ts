import { ProjectMode, TargetLength } from "@/lib/types";
import { sceneCountForLength } from "@/lib/length";

// ─────────────────────────────────────────────────────────
// 한국어 전용 프롬프트
// ─────────────────────────────────────────────────────────
export function buildScriptPromptKo({
  mode,
  topic,
  sourceText,
  targetLength,
}: {
  mode: ProjectMode;
  topic?: string;
  sourceText?: string;
  targetLength: TargetLength;
}) {
  const sceneCount = String(sceneCountForLength(targetLength));

  const commonInstruction = `
- 출력은 반드시 아래 JSON 형식만. 서문·마크다운·설명 일절 금지.
- 언어 지침: 반드시 **한국어**로만 작성하라. 영어 단어가 섞이지 않도록 완벽한 한국어 구어체로 작성하라.
- **【톤】 주제의 결을 읽고 거기 맞는 말투·호흡으로 청중을 붙잡아라. 모든 주제를 강의·교과서 톤("~에 대해 알아보겠습니다")으로 획일화하지 말 것.**
- scenes 배열의 각 항목: order(정수), narration(구어체 나레이션 문장), visualIntent(이 장면에서 보여줄 그림/도형/키워드 한 줄 묘사).
- 장면 수: 정확히 ${sceneCount}개. (총 ${targetLength}초 = 이미지 1장당 약 7초). 이 개수를 반드시 지켜라.
- **각 장면 나레이션은 한국어 48~56자, 2~3문장으로 작성하라.** 한 문장짜리 너무 짧은 나레이션 금지. (한국어 TTS 실측 약 7자/초 → 50자 ≈ 7초)
- **【매우 중요】 나레이션은 음성합성(TTS)으로 그대로 읽힌다. TTS는 띄어쓰기와 쉼표로만 끊어읽기를 판단하므로, 읽기 호흡이 정확히 보이도록 써라:**
  · **띄어쓰기를 표준 맞춤법대로 100% 정확히** — 붙여쓰기·오타가 있으면 TTS가 뭉갠다.
  · **호흡이 필요한 모든 지점에 쉼표(,)** — 긴 주어 뒤, 긴 수식어구 뒤, 접속어 앞뒤, 나열 사이.
  · 문장은 너무 길게 늘이지 말고, 호흡 단위로 마침표(.)·물음표(?)를 적극 사용.
  예) ✗ "물은항상위에서아래로흐르는데이것은중력때문입니다"  ✓ "물은 항상 위에서 아래로 흐릅니다. 그 이유는, 바로 중력 때문이죠."
- 한 장면은 하나의 완결된 소주제를 담는다.
- visualIntent는 7초 동안 판서로 그릴 수 있는 복잡도로 묘사하라: 핵심 그림 1~2개 + 키워드 라벨 1~2개.
- **title은 클릭을 부르는 강한 훅으로 작성하라**: 호기심을 자극하는 질문 또는 의외의 사실, 12~22자 내외.
- **thumbnailHook**: 위 title보다 **더 짧고 더 자극적인** 썸네일 문구. **14자 이내**, 한눈에 꽂히게.
- **keySceneOrder**: scenes 중 **가장 임팩트가 강해 썸네일 배경으로 쓸 장면의 order 번호**.

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
    return `너는 사람들의 이목을 단번에 사로잡는 타고난 스토리텔러다. 어떤 주제든 첫 문장부터 빠져들게 만드는 화술을 가졌다. 지식은 명료하고 깊이 있게, 연예·가십은 친구에게 비밀을 털어놓듯 흥미진진하게, 시사·경제는 핵심을 꿰뚫어 긴장감 있게 — 주제의 결을 읽고 거기 딱 맞는 말투와 호흡으로 청중을 끝까지 붙잡아둔다.
주어진 주제로 드로잉-리빌 방식의 영상 원고를 작성하라.

**【도입 훅 — 매우 중요】 1번 장면(첫 5초)은 곧바로 배경·정의 설명으로 시작하지 마라.** 궁금증을 터뜨리는 한 방으로 열어라 — 충격적 사실, 의외의 반전 예고, 또는 도발적인 질문. 시청자가 "이건 끝까지 봐야 해" 싶게 만든 뒤, **본격적인 배경·이야기는 2번 장면부터** 펼쳐라. (예: ✗ "1940년대 유럽은 전쟁 중이었습니다" → ✓ "한 남자가, 거짓말만으로 히틀러를 속였습니다. 어떻게 가능했을까요?")

주제: ${topic}
${commonInstruction}`;
  }

  return `너는 사람들의 이목을 사로잡는 타고난 스토리텔러다. 아래 원본 자료의 사실·논리·용어·전개 순서를 100% 보존하면서, 형식만 변환하라(원본의 톤·의도는 살리되 더 빠져들게 다듬는다).
변환 규칙: 문어체→나레이션 구어체, 목표 길이에 맞게 축약/확장, 장면 분할, 장면별 시각화 의도 부여.
"내용 동결, 형식 변환" 원칙. 사실 추가·삭제·왜곡 금지.

원본 자료:
${sourceText}
${commonInstruction}`;
}


// ─────────────────────────────────────────────────────────
// 영어 전용 프롬프트
// ─────────────────────────────────────────────────────────
export function buildScriptPromptEn({
  mode,
  topic,
  sourceText,
  targetLength,
}: {
  mode: ProjectMode;
  topic?: string;
  sourceText?: string;
  targetLength: TargetLength;
}) {
  const sceneCount = String(sceneCountForLength(targetLength));

  const commonInstruction = `
- Output MUST be exactly in the JSON format below. NO introductions, NO markdown code blocks, NO explanations.
- Language Instruction: You MUST write EVERYTHING in **English**. Do not mix with Korean or any other language.
- **[TONE] Read the nature of the topic and match your voice and pacing to hold the audience. Do NOT flatten every topic into a lecture or textbook tone ("Today, let's learn about...").**
- "scenes" array items: "order" (integer), "narration" (spoken narration sentences), "visualIntent" (short description of drawing/shapes/keywords for this scene).
- Number of scenes: EXACTLY ${sceneCount} scenes. (Total ${targetLength} sec = approx 7 sec per scene).
- **Narration for each scene MUST be approx 10~25 words.** Keep the sentence structure natural and suitable for TTS. (English TTS approx 15 words ≈ 7 sec).
- **【CRITICAL】 Narration is read by TTS. TTS relies entirely on punctuation and spaces for pacing:**
  · Use commas (,) wherever a natural breathing pause is needed (e.g. after long subjects, intro phrases, conjunctions).
  · Keep sentences short and use periods (.) and question marks (?) to define clear breathing units.
- Each scene should convey one complete sub-topic.
- "visualIntent": Keep it simple enough to be drawn in 7 seconds. 1-2 core icons + 1-2 keyword labels.
- **"title" MUST be a strong, click-inducing hook**: 4-8 words. Provoke curiosity.
- **"thumbnailHook"**: Even shorter and punchier than the title. **Max 4 words**, extremely eye-catching for a thumbnail.
- **"keySceneOrder"**: The order number of the most visually impactful scene to be used as the thumbnail background.

Output Format:
{
  "title": "Video Title",
  "thumbnailHook": "Punchy Hook",
  "keySceneOrder": 3,
  "scenes": [
    { "order": 1, "narration": "...", "visualIntent": "..." }
  ]
}`;

  if (mode === "generate") {
    return `You are a born storyteller who instantly captures people's attention. Whatever the topic, you hook them from the very first line. Knowledge — clear and deep; celebrity/gossip — juicy, like sharing a secret with a friend; current affairs/economics — sharp and tense, cutting to the core. You read the grain of each subject and use the exact voice and pacing that holds the audience to the end.
Write a script for a "draw and reveal" style video on the given topic.

**[OPENING HOOK — CRITICAL] Scene 1 (the first 5 seconds) must NOT start with background or definitions.** Open with a curiosity bomb — a shocking fact, a teased twist, or a provocative question that makes viewers feel "I have to watch this to the end." Save the actual background and story for scene 2 onward. (e.g. ✗ "In the 1940s, Europe was at war" → ✓ "One man fooled Hitler with nothing but lies. How?")

Topic: ${topic}
${commonInstruction}`;
  }

  return `You are a born storyteller, but in this task your job is to faithfully transform the provided source text into a structured video script while preserving 100% of the original content, style, tone, and message.
Rules:
1. **【CRITICAL】 DO NOT explain or answer any questions asked in the source text.** If the source text asks rhetorical questions (e.g., "Why do Koreans ask your age?"), do NOT provide any answers, facts, or explanations. Keep them as questions exactly as written.
2. **【CRITICAL】 Do NOT add any external facts, fictional stories, or information not present in the source text.**
3. **【CRITICAL】 Preserve the exact tone (e.g. teaser, inquiry, channel intro) of the source text.**
4. Split the source text logically into exactly ${sceneCount} scenes. Adjust spacing and punctuation (commas, periods, question marks) to make it suitable for TTS, but do not invent new content.

Source Text:
${sourceText}
${commonInstruction}`;
}
