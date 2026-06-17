import { adminDb } from "./firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * 영상 생성 단계별 이벤트 로그. projects/{id}/events 에 1건씩 적재.
 * 환불·크레딧 보정 판단의 근거(이 사용자가 어느 단계에서 실패했는지)로 쓴다.
 * 절대 throw 하지 않음(로깅 실패가 본 파이프라인을 막으면 안 됨).
 */
export async function logEvent(
  projectId: string,
  step: string,
  opts?: { status?: "ok" | "error" | "info"; message?: string; meta?: Record<string, unknown> },
): Promise<void> {
  try {
    await adminDb()
      .collection("projects").doc(projectId)
      .collection("events").add({
        step,
        status: opts?.status ?? "info",
        message: opts?.message ?? null,
        meta: opts?.meta ?? null,
        at: FieldValue.serverTimestamp(),
      });
  } catch (e) {
    console.error("logEvent failed:", e);
  }
}
