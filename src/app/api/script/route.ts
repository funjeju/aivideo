import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { adminDb } from "@/lib/firebase/admin";
import { buildScriptPrompt } from "@/lib/llm/prompts";
import { ProjectMode, TargetLength } from "@/lib/types";
import { resolveLlmModel, isReasoningModel } from "@/lib/llm/model";
import { isGeminiModel, geminiGenerateJSON, geminiAvailable } from "@/lib/llm/gemini";
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

    // faithful(원고 충실)인데 body에 sourceText가 없으면 project doc에서 읽는다.
    // (파일 업로드/원고 붙여넣기 모두 /api/projects가 doc.sourceText에 저장한다)
    let resolvedSource = sourceText as string | undefined;
    if (!resolvedSource && mode === "faithful") {
      const pd = (await adminDb().collection("projects").doc(projectId).get()).data();
      resolvedSource = pd?.sourceText ?? "";
    }

    const prompt = buildScriptPrompt({
      mode: mode as ProjectMode,
      topic,
      sourceText: resolvedSource,
      targetLength: targetLength as TargetLength,
      contentLocale: contentLocale ?? "ko",
    });

    // 어드민에서 고른 LLM 모델 (settings/global.llmModel, 기본 gpt-4o). gemini면 Gemini.
    const settings = (await adminDb().collection("settings").doc("global").get()).data() ?? {};
    const model = resolveLlmModel(settings.llmModel);
    const useGemini = isGeminiModel(model) && geminiAvailable();

    let raw: string;
    let llmCostUsd = 0;
    if (useGemini) {
      raw = await geminiGenerateJSON({ model, prompt });
    } else {
      // gemini 선택했는데 키가 없으면 gpt-4o로 폴백(500 방지)
      const oaModel = isGeminiModel(model) ? "gpt-4o" : model;
      const completion = await openai.chat.completions.create({
        model: oaModel,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        ...(isReasoningModel(oaModel) ? {} : { temperature: 0.7 }),
      });
      raw = completion.choices[0].message.content ?? "{}";
      llmCostUsd = estimateLlmCost(completion.usage);
    }
    const parsed = JSON.parse(raw);

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
