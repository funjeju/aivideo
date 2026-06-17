import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeRequest, ownsProject } from "@/lib/auth";
import { checkBillingGate, FREE_VIDEO_LIMIT, isExemptUser } from "@/lib/billing";

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeRequest(req);
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { projectId } = await req.json();
    if (!projectId) {
      return NextResponse.json({ error: "projectId required" }, { status: 400 });
    }
    if (!(await ownsProject(auth, projectId))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // 과금 게이트 (이미지 생성 = 진짜 비용 발생 직전)
    const projSnap = await adminDb().collection("projects").doc(projectId).get();
    const projData = projSnap.data() ?? {};
    const ownerId = projData.ownerId as string;
    const targetLength = (projData.targetLength as number) ?? 180;

    // 무료 한도 게이트 — 비면제 사용자는 최대 FREE_VIDEO_LIMIT편 (런칭 비용 보호).
    const userRef = adminDb().collection("users").doc(ownerId);
    const u = (await userRef.get()).data() ?? {};
    if (!isExemptUser(u)) {
      const used = (u.freeVideosUsed as number) ?? 0;
      const alreadyCounted = projData.countedFree === true;
      if (!alreadyCounted && used >= FREE_VIDEO_LIMIT) {
        return NextResponse.json({ error: "free_limit", used, limit: FREE_VIDEO_LIMIT }, { status: 403 });
      }
      // 이 프로젝트를 처음 승인할 때만 1편 카운트(재승인·재시도 중복 방지)
      if (!alreadyCounted) {
        await userRef.set({ freeVideosUsed: FieldValue.increment(1) }, { merge: true });
        await adminDb().collection("projects").doc(projectId).update({ countedFree: true });
      }
    }

    const gate = await checkBillingGate(ownerId, targetLength);
    if (!gate.allowed) {
      return NextResponse.json(
        { error: "insufficient_credits", credits: gate.credits, estimate: gate.estimate },
        { status: 402 }
      );
    }

    await adminDb()
      .collection("projects")
      .doc(projectId)
      .update({
        scriptApproved: true,
        status: "approved",
        updatedAt: FieldValue.serverTimestamp(),
      });

    // 이미지 생성 트리거는 클라이언트가 status="approved"를 보고 직접 호출한다(ProjectView).
    // 서버측 fire-and-forget은 Vercel이 응답 후 함수를 종료시켜 잘리는 문제가 있어 제거.
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "approve failed" }, { status: 500 });
  }
}
