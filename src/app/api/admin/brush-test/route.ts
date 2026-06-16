import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAuthedUser, isAdmin } from "@/lib/auth";
import { getStylePack } from "@/lib/style-packs";
import { buildSceneSpec } from "@/lib/pipeline/planner";
import { RevealObject } from "@/lib/types";

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function visionPrompt(narration: string): string {
  return `너는 화이트보드 드로잉 영상의 연출가다. 이미지를 분석하고, 나레이션을 들으며 펜으로 그려나갈 순서를 정하라.

[나레이션]
"${narration}"

각 시각 요소(제목/라벨/그림/화살표/도형)에 대해:
- id: "obj_1" ...
- bbox: [x1,y1,x2,y2] — 정규화 좌표. 이미지 왼쪽 끝=0, 오른쪽 끝=1000, 위=0, 아래=1000.
  (이미지의 실제 가로세로 비율과 무관하게 항상 0~1000. 요소를 여유있게 감싸되 잘리지 않게)
- role: "title"|"label"|"illustration"|"arrow"|"shape"
- revealOrder: 나레이션 흐름상 등장 순서(1부터). 먼저 언급되는 개념의 요소가 먼저.
- anchorText: 이 요소가 대응하는 나레이션 속 구절을 원문 그대로 복사.

JSON만 출력:
{ "objects": [ { "id":"obj_1","bbox":[..],"role":"illustration","revealOrder":1,"anchorText":".." } ] }`;
}

export async function POST(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const { imageBase64, narration, stylePackId, brushSize, durationSec, aspect } = await req.json();
    const asp: "9:16" | "16:9" | "1:1" = aspect === "16:9" || aspect === "1:1" ? aspect : "9:16";
    if (!imageBase64) return NextResponse.json({ error: "imageBase64 required" }, { status: 400 });
    const narr = (narration as string) ?? "";

    // Vision: OCR/의미 분석 (Firestore 저장 없음 — 테스트 전용)
    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            // high: bbox 좌표 정밀도 확보 (low=512px 분석은 박스가 뭉개져 획 배정이 틀어짐)
            { type: "image_url", image_url: { url: imageBase64, detail: "high" } },
            { type: "text", text: visionPrompt(narr) },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1200,
    });
    const parsed = JSON.parse(res.choices[0].message.content ?? "{}");
    // bbox는 정규화 0~1000 그대로 — 렌더러(BBOX_NORM)가 실제 그려지는 크기에 비례 변환
    const objects: RevealObject[] = parsed.objects ?? [];

    // Planner: 의미 순서 + 시간 동기화로 sceneSpec 생성
    const pack = getStylePack(stylePackId ?? "ink-wash");
    const dur = Number(durationSec) || Math.max(narr.length / 5, 6);
    const sceneSpec = buildSceneSpec({
      sceneId: "test",
      order: 1,
      narration: narr,
      durationSec: dur,
      audioUrl: "",
      imageUrl: "", // 클라가 로컬 이미지로 렌더
      objects,
      stylePack: pack,
      aspect: asp,
      brushSize: Number(brushSize) || 1,
    });

    return NextResponse.json({ sceneSpec, objects, durationSec: dur });
  } catch (e) {
    console.error("brush-test failed:", e);
    return NextResponse.json({ error: "analysis failed" }, { status: 500 });
  }
}
