import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { adminDb } from "@/lib/firebase/admin";
import { buildScriptPrompt } from "@/lib/llm/prompts";
import { ProjectMode, TargetLength } from "@/lib/types";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeRequest, ownsProject } from "@/lib/auth";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeRequest(req);
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { projectId, mode, topic, sourceText, targetLength, contentLocale } =
      await req.json();

    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }

    if (!(await ownsProject(auth, projectId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const prompt = buildScriptPrompt({
      mode: mode as ProjectMode,
      topic,
      sourceText,
      targetLength: targetLength as TargetLength,
      contentLocale: contentLocale ?? "ko",
    });

    const startTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const raw = completion.choices[0].message.content ?? "{}";
    const parsed = JSON.parse(raw);
    const llmCostUsd = estimateLlmCost(completion.usage);

    const db = adminDb();
    const projectRef = db.collection("projects").doc(projectId);
    const batch = db.batch();

    // 기존 scenes 삭제
    const existingScenes = await projectRef.collection("scenes").listDocuments();
    existingScenes.forEach((d) => batch.delete(d));

    // 새 scenes 저장
    for (const scene of parsed.scenes ?? []) {
      const sceneRef = projectRef.collection("scenes").doc();
      batch.set(sceneRef, {
        order: scene.order,
        narration: scene.narration,
        visualIntent: scene.visualIntent,
        durationSec: 0,
        imageStatus: "pending",
        audioUrl: null,
      });
    }

    // 프로젝트 상태 갱신
    batch.update(projectRef, {
      title: parsed.title ?? "",
      status: "script_ready",
      updatedAt: FieldValue.serverTimestamp(),
      "costLog.llmCostUsd": llmCostUsd,
    });

    await batch.commit();

    return NextResponse.json({
      title: parsed.title,
      scenes: parsed.scenes,
      llmCostUsd,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "script generation failed" }, { status: 500 });
  }
}

function estimateLlmCost(usage?: OpenAI.CompletionUsage): number {
  if (!usage) return 0;
  // gpt-4o 기준: input $2.5/1M, output $10/1M
  return (usage.prompt_tokens * 2.5 + usage.completion_tokens * 10) / 1_000_000;
}
