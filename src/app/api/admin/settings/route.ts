import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuthedUser, isAdmin, isSuperAdmin } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";

const ref = () => adminDb().collection("settings").doc("global");

export async function GET(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const d = (await ref().get()).data() ?? {};
  return NextResponse.json({
    billingEnabled: d.billingEnabled === true,
    brushSize: d.brushSize ?? 1,
    brushCount: d.brushCount ?? 1,
    brushSpeed: d.brushSpeed ?? 1,
    brushType: d.brushType ?? "round",
    handAsset: d.handAsset ?? "",       // ""=스타일팩 기본 도구 사용
    flowMode: d.flowMode ?? "sync",     // sync | topdown
  });
}

const BRUSH_TYPES = ["round", "dry", "flat", "bristle", "ink", "pencil", "charcoal", "watercolor", "crayon"];
const HAND_ASSETS = ["", "brush", "marker", "pen", "hand-pen", "hand-brush", "hand-marker"];

export async function POST(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me || !isSuperAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (typeof body.billingEnabled === "boolean") patch.billingEnabled = body.billingEnabled;
  if (typeof body.brushSize === "number") patch.brushSize = Math.min(6, Math.max(0.3, body.brushSize));
  if (typeof body.brushCount === "number") patch.brushCount = Math.min(6, Math.max(1, Math.round(body.brushCount)));
  if (typeof body.brushSpeed === "number") patch.brushSpeed = Math.min(4, Math.max(0.05, body.brushSpeed));
  if (typeof body.brushType === "string" && BRUSH_TYPES.includes(body.brushType)) patch.brushType = body.brushType;
  if (typeof body.handAsset === "string" && HAND_ASSETS.includes(body.handAsset)) patch.handAsset = body.handAsset;
  if (body.flowMode === "sync" || body.flowMode === "topdown") patch.flowMode = body.flowMode;
  await ref().set(patch, { merge: true });
  return NextResponse.json({ ok: true });
}
