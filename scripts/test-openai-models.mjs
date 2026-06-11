// OpenAI 키 유효성 + 사용 가능한 이미지/TTS 모델 확인 (무료)
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const res = await fetch("https://api.openai.com/v1/models", {
  headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
});

if (!res.ok) {
  console.error("❌ OpenAI 키 실패:", res.status, await res.text());
  process.exit(1);
}

const data = await res.json();
const ids = data.data.map((m) => m.id).sort();

console.log("✅ OpenAI 키 유효. 모델 수:", ids.length);
console.log("\n[이미지 모델]");
console.log(ids.filter((id) => id.includes("image") || id.includes("dall")).join("\n") || "  (없음)");
console.log("\n[음성/TTS 모델]");
console.log(ids.filter((id) => id.includes("tts") || id.includes("audio") || id.includes("speech")).join("\n") || "  (없음)");
console.log("\n[GPT-4 계열]");
console.log(ids.filter((id) => id.startsWith("gpt-4")).join("\n") || "  (없음)");
