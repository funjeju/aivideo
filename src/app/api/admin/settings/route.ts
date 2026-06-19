import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuthedUser, isAdmin, isSuperAdmin } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";
import { LLM_MODELS, DEFAULT_LLM_MODEL } from "@/lib/llm/model";

const ref = () => adminDb().collection("settings").doc("global");

const BRUSH_TYPES = ["round", "dry", "flat", "bristle", "ink", "pencil", "charcoal", "watercolor", "crayon"];
const HAND_ASSETS = ["", "brush", "marker", "pen", "hand-pen", "hand-brush", "hand-marker"];

// 붓 게이지 기본값 (프리셋 값이 없을 때)
const BRUSH_DEFAULTS = {
  brushSize: 1, brushCount: 1, brushSpeed: 1,
  brushType: "round", handAsset: "", flowMode: "sync",
  inkSpread: 0.5, fillRange: 1,
};

type BrushSettings = typeof BRUSH_DEFAULTS;

/** doc + (선택)프리셋 → 적용할 붓 설정. 프리셋 값이 우선, 없으면 전역, 없으면 기본값. */
function resolveBrush(doc: Record<string, unknown>, stylePackId?: string): BrushSettings {
  const presets = (doc.presets ?? {}) as Record<string, Partial<BrushSettings>>;
  const p = (stylePackId && presets[stylePackId]) || {};
  const g = doc as Partial<BrushSettings>;
  return {
    brushSize: p.brushSize ?? g.brushSize ?? BRUSH_DEFAULTS.brushSize,
    brushCount: p.brushCount ?? g.brushCount ?? BRUSH_DEFAULTS.brushCount,
    brushSpeed: p.brushSpeed ?? g.brushSpeed ?? BRUSH_DEFAULTS.brushSpeed,
    brushType: p.brushType ?? g.brushType ?? BRUSH_DEFAULTS.brushType,
    handAsset: p.handAsset ?? g.handAsset ?? BRUSH_DEFAULTS.handAsset,
    flowMode: p.flowMode ?? g.flowMode ?? BRUSH_DEFAULTS.flowMode,
    inkSpread: p.inkSpread ?? g.inkSpread ?? BRUSH_DEFAULTS.inkSpread,
    fillRange: p.fillRange ?? g.fillRange ?? BRUSH_DEFAULTS.fillRange,
  };
}

export async function GET(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const d = (await ref().get()).data() ?? {};
  const stylePackId = req.nextUrl.searchParams.get("stylePackId") ?? undefined;
  return NextResponse.json({
    billingEnabled: d.billingEnabled === true,
    subtitles: d.subtitles !== false, // 기본 ON
    llmModel: LLM_MODELS.includes(d.llmModel) ? d.llmModel : DEFAULT_LLM_MODEL,
    imageQuality: ["low", "medium", "high"].includes(d.imageQuality) ? d.imageQuality : "medium",
    ...resolveBrush(d, stylePackId),
  });
}

export async function POST(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isSuperAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();

  // 붓 게이지 필드 검증
  const brush: Record<string, unknown> = {};
  if (typeof body.brushSize === "number") brush.brushSize = Math.min(6, Math.max(0.3, body.brushSize));
  if (typeof body.brushCount === "number") brush.brushCount = Math.min(6, Math.max(1, Math.round(body.brushCount)));
  if (typeof body.brushSpeed === "number") brush.brushSpeed = Math.min(4, Math.max(0.05, body.brushSpeed));
  if (typeof body.brushType === "string" && BRUSH_TYPES.includes(body.brushType)) brush.brushType = body.brushType;
  if (typeof body.handAsset === "string" && HAND_ASSETS.includes(body.handAsset)) brush.handAsset = body.handAsset;
  if (body.flowMode === "sync" || body.flowMode === "topdown") brush.flowMode = body.flowMode;
  if (typeof body.inkSpread === "number") brush.inkSpread = Math.min(1, Math.max(0, body.inkSpread));
  if (typeof body.fillRange === "number") brush.fillRange = Math.min(1, Math.max(0.1, body.fillRange));

  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (typeof body.billingEnabled === "boolean") patch.billingEnabled = body.billingEnabled;
  if (typeof body.subtitles === "boolean") patch.subtitles = body.subtitles;
  if (typeof body.llmModel === "string" && LLM_MODELS.includes(body.llmModel as never)) patch.llmModel = body.llmModel;
  if (body.imageQuality === "low" || body.imageQuality === "medium" || body.imageQuality === "high") patch.imageQuality = body.imageQuality;

  // stylePackId가 있으면 해당 프리셋에만 저장, 없으면 전역(레거시 기본)
  if (typeof body.stylePackId === "string" && body.stylePackId) {
    patch.presets = { [body.stylePackId]: brush };
  } else {
    Object.assign(patch, brush);
  }

  await ref().set(patch, { merge: true });
  return NextResponse.json({ ok: true });
}
