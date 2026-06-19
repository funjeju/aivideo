import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthedUser, isAdmin } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 인사이트 원문(Reddit raw) 1건 → AI 분석.
 * 제목+본문+인기댓글(토론)을 읽고, 영상으로 만들 만한 한국어 주제·앵글·요약을 뽑아
 * reddit_raw 문서에 analysis로 저장하고 analyzed=true 처리한다.
 */
export async function POST(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const ref = adminDb().collection("reddit_raw").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "not found" }, { status: 404 });
    const p = snap.data()!;

    const comments = Array.isArray(p.top_comments) ? p.top_comments : [];
    const commentText = comments
      .map((c: { body?: string; ups?: string | number }, i: number) => `${i + 1}. (▲${c.ups ?? 0}) ${c.body ?? ""}`)
      .join("\n");

    const prompt = `너는 해외 반응·인사이트 영상의 기획자다. 아래는 Reddit(${p.subreddit}) 인기 글과 댓글이다.
이 토론에서 한국 시청자가 흥미로워할 "영상 한 편" 거리를 뽑아라.

[제목] ${p.title}
[본문] ${p.selftext || "(없음 — 사진/링크 글)"}
[인기 댓글]
${commentText || "(없음)"}

출력은 JSON만:
{
  "topic": "영상 주제 한 줄 (한국어, 호기심 자극하는 후킹형, 18~30자)",
  "angle": "어떤 관점/구성으로 풀지 한 줄 (한국어)",
  "summary": "이 글·댓글의 핵심을 한국어 2~3문장으로 요약 (영상 원고의 출발점이 되게)",
  "worth": 1~5 정수 (영상으로 만들 가치, 5=강력)
}`;

    const c = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const a = JSON.parse(c.choices[0].message.content || "{}");

    const analysis = {
      topic: typeof a.topic === "string" ? a.topic : "",
      angle: typeof a.angle === "string" ? a.angle : "",
      summary: typeof a.summary === "string" ? a.summary : "",
      worth: Number.isFinite(a.worth) ? Math.max(1, Math.min(5, Math.round(a.worth))) : 3,
      at: new Date().toISOString(),
    };

    await ref.update({ analyzed: true, analysis, updatedAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    console.error("insight-analyze failed:", e);
    return NextResponse.json({ error: "analyze failed" }, { status: 500 });
  }
}
