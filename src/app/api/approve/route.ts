import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeRequest, ownsProject } from "@/lib/auth";
import { FREE_VIDEO_LIMIT, isExemptUser, isBillingEnabled, activeTierId, estimateCredits } from "@/lib/billing";
import { holdCredits } from "@/lib/credits";
import { logEvent } from "@/lib/genlog";

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

    // 과금 게이트 (이미지 생성 = 진짜 비용 발생 직전).
    //  - 면제(운영자/billingExempt) → 통과
    //  - 무료 티어 또는 과금 토글 OFF → 무료 체험 하드캡(편수)
    //  - 구독자 & 토글 ON → 선차감(hold): 필요 크레딧을 즉시 차감, 부족하면 거절
    const userRef = adminDb().collection("users").doc(ownerId);
    const u = (await userRef.get()).data() ?? {};
    if (!isExemptUser(u)) {
      const billingOn = await isBillingEnabled();
      const tier = activeTierId(u);

      if (tier === "free" || !billingOn) {
        // 무료 체험 캡 — 최대 FREE_VIDEO_LIMIT편(런칭 비용 보호). 처음 승인 시 1편 카운트.
        const used = (u.freeVideosUsed as number) ?? 0;
        const alreadyCounted = projData.countedFree === true;
        if (!alreadyCounted && used >= FREE_VIDEO_LIMIT) {
          await logEvent(projectId, "blocked", { status: "error", message: "무료 한도 초과", meta: { used, limit: FREE_VIDEO_LIMIT } });
          return NextResponse.json({ error: "free_limit", used, limit: FREE_VIDEO_LIMIT }, { status: 403 });
        }
        if (!alreadyCounted) {
          await userRef.set({ freeVideosUsed: FieldValue.increment(1) }, { merge: true });
          await adminDb().collection("projects").doc(projectId).update({ countedFree: true });
        }
        await logEvent(projectId, "approve", { status: "ok", message: "승인(무료 체험)", meta: { used: used + (alreadyCounted ? 0 : 1) } });
      } else {
        // 구독자 선차감 — 이 프로젝트를 처음 승인할 때만(재승인·재시도 중복차감 방지)
        const need = estimateCredits(targetLength);
        if (!(projData.creditHold > 0)) {
          const res = await holdCredits(ownerId, need, projectId, "영상 생성 선차감");
          if (!res.ok) {
            await logEvent(projectId, "blocked", { status: "error", message: "크레딧 부족", meta: { balance: res.balance, need } });
            return NextResponse.json(
              { error: "insufficient_credits", credits: res.balance, estimate: need },
              { status: 402 }
            );
          }
          await adminDb().collection("projects").doc(projectId).update({ creditHold: need });
        }
        await logEvent(projectId, "approve", { status: "ok", message: "승인(구독·선차감)", meta: { charged: need } });
      }
    } else {
      await logEvent(projectId, "approve", { status: "ok", message: "승인(면제 계정)" });
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
