// Gemini (Google AI Studio / Generative Language API) 호출 헬퍼.
// Vision/텍스트 JSON 생성에 사용. OpenAI와 분기해서 쓴다.

export function isGeminiModel(model: string): boolean {
  return model.startsWith("gemini");
}

/** Gemini 키가 설정돼 있는지 (없으면 호출부에서 gpt-4o로 폴백) */
export function geminiAvailable(): boolean {
  return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

/**
 * Gemini로 JSON 텍스트 생성. imageBase64가 있으면 비전(이미지+프롬프트).
 * 503(과부하) 등은 짧게 재시도.
 */
export async function geminiGenerateJSON(opts: {
  model: string;
  prompt: string;
  imageBase64?: string;
  imageMime?: string;
}): Promise<string> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY not set");

  const parts: unknown[] = [];
  if (opts.imageBase64) {
    parts.push({ inline_data: { mime_type: opts.imageMime ?? "image/png", data: opts.imageBase64 } });
  }
  parts.push({ text: opts.prompt });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`;
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 },
  });

  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(90000),
    });
    if (res.ok) {
      const j = await res.json();
      return j.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    }
    lastErr = `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`;
    if (res.status === 503 || res.status === 429) {
      await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
      continue;
    }
    break;
  }
  throw new Error(`gemini failed: ${lastErr}`);
}

/** 공개 이미지 URL → base64 (Gemini inline_data용) */
export async function fetchImageBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch ${res.status}`);
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}
