import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { RevealObject } from "@/lib/types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const VISION_PROMPT = `이 이미지의 주요 시각 요소를 분석하여 JSON으로 반환하라.

각 요소에 대해:
- id: 고유 식별자 (obj_1, obj_2 ...)
- bbox: [x1, y1, x2, y2] 좌표 (이미지 크기 1024x1536 기준)
- role: "title" | "label" | "illustration" | "arrow" | "shape" 중 하나

출력 형식 (JSON만, 설명 없이):
{
  "objects": [
    { "id": "obj_1", "bbox": [100, 200, 500, 800], "role": "illustration" }
  ]
}`;

export async function POST(req: NextRequest) {
  try {
    const { projectId, sceneId, imageUrl } = await req.json();

    if (!projectId || !sceneId || !imageUrl) {
      return NextResponse.json({ error: "projectId, sceneId, imageUrl required" }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
            { type: "text", text: VISION_PROMPT },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
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
