import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { RevealObject } from "@/lib/types";
import { authorizeRequest, ownsProject } from "@/lib/auth";
import { resolveLlmModel, isReasoningModel } from "@/lib/llm/model";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildVisionPrompt(narration: string): string {
  return `너는 화이트보드 드로잉 영상의 연출가다. 아래 이미지를 분석하고, 나레이션을 들으며 펜으로 그려나갈 순서를 정하라.

[나레이션]
"${narration}"

각 시각 요소(제목, 라벨, 그림, 화살표, 도형)에 대해:
- id: "obj_1", "obj_2" ...
- bbox: [x1, y1, x2, y2] — 정규화 좌표. 이미지 왼쪽 끝=0, 오른쪽 끝=1000, 위=0, 아래=1000 (실제 가로세로 비율과 무관하게 항상 0~1000). **요소 전체를 빠짐없이 감싸되 여유를 약간 둬라**(텍스트가 잘리지 않게 상하좌우 여백 포함).
- role: "title" | "label" | "illustration" | "arrow" | "shape"
- revealOrder: 나레이션 흐름상 등장 순서(1부터).
- anchorText: **이 요소가 대응하는 나레이션 속 핵심 구절을, 나레이션 원문에서 그대로 복사해 적어라**(반드시 위 나레이션에 실제로 들어있는 연속된 문자열). 이 구절이 발화되는 순간 이 요소가 그려지기 시작한다. 예) 나레이션이 "사과를 하나 먹으면 만족스럽죠"이고 사과 그림이면 anchorText는 "사과를 하나".

출력 형식 (JSON만, 설명 없이):
{
  "objects": [
    { "id": "obj_1", "bbox": [100, 200, 500, 520], "role": "illustration", "revealOrder": 1, "anchorText": "나레이션에서 그대로 복사한 구절" }
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

    // 어드민에서 고른 LLM 모델 (기본 gpt-4o). 추론 모델은 토큰 예산↑(추론이 토큰을 소비)
    const settings = (await adminDb().collection("settings").doc("global").get()).data() ?? {};
    const model = resolveLlmModel(settings.llmModel);
    const reasoning = isReasoningModel(model);

    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: [
            // high: bbox 좌표 정밀도 확보 (low는 박스가 뭉개져 드로잉 순서가 틀어짐)
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            { type: "text", text: buildVisionPrompt(narration ?? "") },
          ],
        },
      ],
      response_format: { type: "json_object" },
      ...(reasoning ? { max_completion_tokens: 6000 } : { max_tokens: 1200 }),
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
