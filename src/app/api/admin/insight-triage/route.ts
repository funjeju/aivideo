import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthedUser, isAdmin } from "@/lib/auth";
import { adminDb } from "@/lib/firebase/admin";

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 자동 선별(title triage): 수집된 Reddit 원문 제목들을 한 번에 LLM으로 평가해
 * "영상거리 가치(worth 1~5)"와 카테고리를 매겨 각 문서에 triage로 저장한다.
 * 풍경 사진·단순 짤(낮음) vs 이슈·논쟁·문화 설명형(높음)을 갈라, 목록에서 노이즈를 거른다.
 * gpt-4o-mini 1회 호출(제목만)이라 매우 저렴.
 */
export async function POST(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const snap = await adminDb().collection("reddit_raw").orderBy("post_date", "desc").limit(200).get();
    const docs = snap.docs;
    if (docs.length === 0) return NextResponse.json({ ok: true, rated: 0 });

    const list = docs.map((d, i) => {
      const p = d.data();
      return `${i}\t[${p.comments_count ?? 0}코멘트] ${(p.title ?? "").replace(/\s+/g, " ").slice(0, 140)}`;
    }).join("\n");

    const prompt = `너는 "한국 관련 흥미 콘텐츠" 영상 기획자다. 아래는 Reddit에서 긁은 글 제목 목록이다(번호\t[댓글수] 제목).
각 글이 **한국 시청자가 흥미로워할 영상 한 편 거리가 되는지** 1~5로 평가하라.
- 5: 이슈·사건·논쟁·반전·흥미로운 문화 설명 (토론거리 풍부)
- 3: 그럭저럭, 앵글 잡으면 가능
- 1: 단순 풍경/여행 사진, 짤, 개인 일상, 정보 없는 글 (영상거리 안 됨)
사진 한 장짜리라도 댓글 토론이 뜨거운 논쟁이면 높게, 단순 감상 사진이면 낮게.

목록:
${list}

출력은 JSON만:
{ "ratings": [ { "i": 번호, "worth": 1~5, "cat": "이슈|사건|문화|정치|일상|사진|질문|기타 중 하나" } ] }`;

    const c = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(c.choices[0].message.content || "{}");
    const ratings: { i: number; worth: number; cat: string }[] = parsed.ratings ?? [];

    const db = adminDb();
    const batch = db.batch();
    let rated = 0;
    for (const r of ratings) {
      if (typeof r.i !== "number" || !docs[r.i]) continue;
      batch.update(docs[r.i].ref, {
        triage: {
          worth: Math.max(1, Math.min(5, Math.round(r.worth ?? 3))),
          cat: typeof r.cat === "string" ? r.cat : "기타",
        },
      });
      rated++;
    }
    if (rated > 0) await batch.commit();
    return NextResponse.json({ ok: true, rated });
  } catch (e) {
    console.error("insight-triage failed:", e);
    return NextResponse.json({ error: "triage failed" }, { status: 500 });
  }
}
