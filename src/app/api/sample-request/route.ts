import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * 샘플 영상 신청(컨시어지 리드). 직접 만들기 부담스러운 사용자·업소 사장님용.
 * 이메일 + 주제(또는 업소 정보) + 연락처를 받아 sampleRequests에 저장 → 운영자가 수동 제작·발송.
 * 결제·로그인 불필요(공개 리드 폼).
 */
export async function POST(req: NextRequest) {
  try {
    const { email, topic, contact, kind } = await req.json();
    const e = String(email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      return NextResponse.json({ error: "유효한 이메일을 입력해 주세요" }, { status: 400 });
    }
    const t = String(topic ?? "").trim();
    if (t.length < 2) {
      return NextResponse.json({ error: "주제(또는 업소 정보)를 입력해 주세요" }, { status: 400 });
    }
    await adminDb().collection("sampleRequests").add({
      email: e,
      topic: t.slice(0, 500),
      contact: String(contact ?? "").trim().slice(0, 100) || null,
      kind: kind === "corporate" ? "corporate" : "general",
      status: "new",
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("sample-request failed:", e);
    return NextResponse.json({ error: "신청 처리 실패" }, { status: 500 });
  }
}
