import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { RevealObject } from "@/lib/types";
import { authorizeRequest, ownsProject } from "@/lib/auth";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildVisionPrompt(narration: string): string {
  return `너는 화이트보드 드로잉 영상의 연출가다. 아래 이미지를 분석하고, 나레이션을 들으며 펜으로 그려나갈 순서를 정하라.

[나레이션]
"${narration}"

각 시각 요소(제목, 라벨, 그림, 화살표, 도형)에 대해:
- id: "obj_1", "obj_2" ...
- bbox: [x1, y1, x2, y2] — 이미지 크기 1024x1536 기준. **요소 전체를 빠짐없이 감싸되 여유를 약간 둬라**(텍스트가 잘리지 않게 상하좌우 여백 포함).
- role: "title" | "label" | "illustration" | "arrow" | "shape"
- revealOrder: 나레이션 흐름상 등장 순서(1부터). **나레이션에서 먼저 언급·설명되는 개념의 시각 요소가 먼저 그려지도록** 의미로 판단하라. 단순히 위치순이 아니라 "이 문장을 말할 때 이게 그려져야 한다"는 의미 매칭.
- caption: 이 요소가 나레이션의 어느 부분에 대응하는지 짧게 (디버그용)

출력 형식 (JSON만, 설명 없이):
{
  "objects": [
    { "id": "obj_1", "bbox": [100, 200, 500, 800], "role": "illustration", "revealOrder": 1, "caption": "..." }
  ]
}`;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeRequest(req);
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { projectId, sceneId, imageUrl, narration: narrationIn } = await req.json();

    if (!projectId || !sceneId || !imageUrl) {
      return NextResponse.json({ error: "projectId, sceneId, imageUrl required" }, { status: 400 });
    }
    if (!(await ownsProject(auth, projectId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // narration이 전달 안 됐으면 scene에서 읽음
    let narration = narrationIn as string | undefined;
    if (!narration) {
      const s = await adminDb().collection("projects").doc(projectId).collection("scenes").doc(sceneId).get();
      narration = (s.data()?.narration as string) ?? "";
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            { type: "text", text: buildVisionPrompt(narration ?? "") },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1200,
    });

    const raw = response.choices[0].message.content ?? "{}";
    const parsed = JSON.parse(raw);
    const objects: RevealObject[] = parsed.objects ?? [];

    // Firestore에 저장
    const db = adminDb();
    const sceneRef = db.collection("projects").doc(projectId).collection("scenes").doc(sceneId);
    const sceneSnap = await sceneRef.get();
    const existing = sceneSnap.data()?.sceneSpec ?? {};

    await sceneRef.update({
      sceneSpec: {
        ...existing,
        reveal: { objects },
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ objects });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "vision analysis failed" }, { status: 500 });
  }
}
