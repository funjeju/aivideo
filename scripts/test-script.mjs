// LLM 원고+장면분할 생성 테스트 (~$0.01)
import { readFileSync } from "node:fs";
import OpenAI from "openai";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const topic = "한계효용 체감의 법칙";
const targetLength = 50;
const sceneCount = "7~10";

const prompt = `너는 교육 영상 원고 작가다. 주어진 주제로 드로잉-리빌 방식의 지식 전달 영상 원고를 작성하라.

주제: ${topic}

- 출력은 반드시 아래 JSON 형식만. 서문·마크다운·설명 일절 금지.
- scenes 배열의 각 항목: order(정수), narration(구어체 나레이션 문장), visualIntent(이 장면에서 보여줄 그림/도형/키워드 한 줄 묘사).
- 장면 수: ${sceneCount}개. 각 나레이션은 자연스러운 구어체로, 영상 나레이션으로 읽혔을 때 총 ${targetLength}초 분량이 되도록 조절.
- 한국어로 작성하라.

출력 형식:
{
  "title": "영상 제목",
  "scenes": [
    { "order": 1, "narration": "...", "visualIntent": "..." }
  ]
}`;

console.time("LLM");
const completion = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: prompt }],
  response_format: { type: "json_object" },
  temperature: 0.7,
});
console.timeEnd("LLM");

const raw = completion.choices[0].message.content;
const parsed = JSON.parse(raw);

console.log("\n✅ 제목:", parsed.title);
console.log("✅ 장면 수:", parsed.scenes?.length);
console.log("\n--- 장면 ---");
for (const s of parsed.scenes ?? []) {
  console.log(`[${s.order}] ${s.narration}`);
  console.log(`    🎨 ${s.visualIntent}\n`);
}

const u = completion.usage;
const cost = (u.prompt_tokens * 2.5 + u.completion_tokens * 10) / 1_000_000;
console.log(`토큰: in ${u.prompt_tokens} / out ${u.completion_tokens} → 비용 $${cost.toFixed(4)}`);
