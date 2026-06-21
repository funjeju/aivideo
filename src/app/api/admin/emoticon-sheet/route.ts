import { NextRequest, NextResponse } from "next/server";
import OpenAI, { toFile } from "openai";
import { getAuthedUser, isAdmin } from "@/lib/auth";

export const maxDuration = 180;

// 독립 테스트 라우트 — 다른 시스템 무관. gpt-image-2로 "스프라이트 시트(모델 시트)" 1장 생성.
// 한 장에 여러 프레임을 그리므로 프레임 간 캐릭터 일관성이 태생적으로 보장됨(따로 N번 생성 X).
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2 });

const GRID: Record<number, string> = { 4: "2x2", 6: "2 rows x 3 columns", 9: "3x3" };

export async function POST(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const { character, action, frames, refDataUrl } = await req.json();
    const n = [4, 6, 9].includes(Number(frames)) ? Number(frames) : 4;
    const grid = GRID[n];
    const charDesc = String(character ?? "").trim() || "a cute simple cartoon character";
    const act = String(action ?? "").trim() || "waving hand";

    // 스프라이트 시트 프롬프트 — 동일 캐릭터, 동작만 프레임마다 변함, 셀 사이 명확한 여백(나중에 슬라이스/누끼용)
    const prompt =
      `A clean character model sheet / sprite sheet on a plain solid white background. ` +
      `It shows the SAME single character in ${n} sequential animation frames of "${act}", arranged in a neat ${grid} grid with clear even white gaps between every frame. ` +
      `CRITICAL: the character must be IDENTICAL in every frame — same face, hairstyle, outfit, colors, body proportions and art style — ONLY the "${act}" motion changes slightly from frame to frame to form a smooth loop. ` +
      `Each frame: full character, centered in its cell, same size and pose framing. Simple bold clean cartoon style suitable for a messenger sticker/emoticon. No text, no labels, no panel numbers. ` +
      `Character: ${charDesc}.`;

    const size = "1024x1024" as const;
    const quality = "low" as const;

    let b64: string | undefined;
    let usage: Record<string, unknown> | undefined;
    if (typeof refDataUrl === "string" && refDataUrl.startsWith("data:image/")) {
      const buf = Buffer.from(refDataUrl.split(",")[1] ?? "", "base64");
      const ref = await toFile(buf, "ref.png", { type: "image/png" });
      const r = await openai.images.edit({ model: "gpt-image-2", image: ref, prompt, size, quality });
      b64 = r.data?.[0]?.b64_json; usage = r.usage as unknown as Record<string, unknown>;
    } else {
      const r = await openai.images.generate({ model: "gpt-image-2", prompt, n: 1, size, quality });
      b64 = r.data?.[0]?.b64_json; usage = r.usage as unknown as Record<string, unknown>;
    }
    if (!b64) throw new Error("no image data");

    const u = (usage ?? {}) as { input_tokens_details?: { text_tokens?: number; image_tokens?: number }; output_tokens?: number };
    const imgIn = u.input_tokens_details?.image_tokens ?? 0;
    const txtIn = u.input_tokens_details?.text_tokens ?? 0;
    const out = u.output_tokens ?? 0;
    const costUsd = (imgIn * 8 + txtIn * 5 + out * 30) / 1_000_000;

    return NextResponse.json({
      image: `data:image/png;base64,${b64}`,
      frames: n,
      grid,
      costUsd: Math.round(costUsd * 10000) / 10000,
      costKrw: Math.round(costUsd * 1380),
    });
  } catch (e) {
    console.error("emoticon-sheet failed:", e);
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
