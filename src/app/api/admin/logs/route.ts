import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getAuthedUser, isSuperAdmin } from "@/lib/auth";

/**
 * 어드민 생성 로그 조회.
 * - projectId 없음: 최근 프로젝트 목록(상태·소유자·크레딧 정황).
 * - projectId 있음: 해당 프로젝트의 단계별 이벤트 타임라인.
 */
export async function GET(req: NextRequest) {
  const me = await getAuthedUser(req);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isSuperAdmin(me.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const db = adminDb();
  const projectId = req.nextUrl.searchParams.get("projectId");

  if (projectId) {
    const snap = await db.collection("projects").doc(projectId).collection("events").orderBy("at", "asc").limit(200).get();
    const events = snap.docs.map((d) => {
      const e = d.data();
      return { id: d.id, step: e.step, status: e.status, message: e.message, meta: e.meta, at: e.at?.toMillis?.() ?? null };
    });
    return NextResponse.json({ events });
  }

  // 최근 프로젝트 40건
  const snap = await db.collection("projects").orderBy("updatedAt", "desc").limit(40).get();
  const ownerIds = [...new Set(snap.docs.map((d) => d.data().ownerId).filter(Boolean))] as string[];
  const emailById: Record<string, string> = {};
  if (ownerIds.length) {
    const refs = ownerIds.map((id) => db.collection("users").doc(id));
    const users = await db.getAll(...refs);
    users.forEach((u) => { if (u.exists) emailById[u.id] = (u.data()?.email as string) ?? ""; });
  }

  const projects = snap.docs.map((d) => {
    const p = d.data();
    return {
      id: d.id,
      title: p.title ?? "(제목 없음)",
      ownerEmail: emailById[p.ownerId] ?? p.ownerId ?? "",
      status: p.status ?? "",
      targetLength: p.targetLength ?? null,
      creditHold: p.creditHold ?? 0,
      creditSettled: p.creditSettled ?? false,
      creditRefunded: p.creditRefunded ?? false,
      countedFree: p.countedFree ?? false,
      updatedAt: p.updatedAt?.toMillis?.() ?? null,
    };
  });
  return NextResponse.json({ projects });
}
