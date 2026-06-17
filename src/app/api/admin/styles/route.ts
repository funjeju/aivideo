import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuthedUser, isSuperAdmin } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";
import { STYLE_PACKS, STYLE_EMOJI } from "@/lib/style-packs";
import { TEMPLATE_SAMPLES } from "@/lib/landing-samples";

/**
 * 화풍 프리셋 관리.
 * - GET: 전체 카탈로그(기본 enabled, 노출 override, 갤러리 샘플 보유 여부).
 * - POST {id, enabled}: settings/styles.overrides[id] 토글(노출 on/off).
 * 노출 효과 = overrides[id] ?? pack.enabled. (CreateForm이 동일 규칙으로 필터)
 */
export async function GET(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isSuperAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const overrides = (await adminDb().collection("settings").doc("styles").get()).data()?.overrides ?? {};
  const sampleIds = new Set(TEMPLATE_SAMPLES.map((t) => t.id));

  const packs = Object.values(STYLE_PACKS)
    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
    .map((p) => ({
      id: p.id,
      name: p.name,
      emoji: STYLE_EMOJI[p.id] ?? "🎨",
      sortOrder: p.sortOrder ?? 99,
      defaultEnabled: p.enabled !== false,
      override: (overrides as Record<string, boolean>)[p.id] ?? null,
      visible: (overrides as Record<string, boolean>)[p.id] ?? p.enabled !== false,
      hasSample: sampleIds.has(p.id as never),
    }));

  return NextResponse.json({ packs });
}

export async function POST(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isSuperAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id, enabled } = await req.json();
  if (!id || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "id, enabled required" }, { status: 400 });
  }
  await adminDb().collection("settings").doc("styles").set(
    { overrides: { [id]: enabled }, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return NextResponse.json({ ok: true });
}
