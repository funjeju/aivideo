import { NextResponse } from "next/server";

/** 배포 환경 진단 — 비밀값은 노출하지 않고 초기화 가능 여부만 보고 */
export async function GET() {
  const report: Record<string, string> = {};

  // 1. env 존재 여부
  report.OPENAI_API_KEY = process.env.OPENAI_API_KEY ? "set" : "MISSING";
  report.INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET ? "set" : "MISSING";
  report.STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "MISSING";

  // 2. SA 키 JSON 파싱
  const sa = process.env.FIREBASE_ADMIN_SA_KEY;
  if (!sa) {
    report.SA_KEY = "MISSING";
  } else {
    try {
      const parsed = JSON.parse(sa);
      report.SA_KEY = `parsed ok (project: ${parsed.project_id}, key starts: ${String(parsed.private_key).slice(0, 30)}...)`;
    } catch (e) {
      report.SA_KEY = `JSON PARSE FAILED: ${(e as Error).message.slice(0, 80)} / length=${sa.length} / first chars: ${sa.slice(0, 20)}`;
    }
  }

  // 3. admin SDK 초기화 + Firestore 읽기
  try {
    const { adminDb } = await import("@/lib/firebase/admin");
    await adminDb().collection("settings").doc("global").get();
    report.FIRESTORE = "ok";
  } catch (e) {
    report.FIRESTORE = `FAILED: ${(e as Error).message.slice(0, 120)}`;
  }

  // 4. Storage 버킷
  try {
    const { adminStorage } = await import("@/lib/firebase/admin");
    const [exists] = await adminStorage().bucket().exists();
    report.STORAGE = exists ? "ok" : "bucket not found";
  } catch (e) {
    report.STORAGE = `FAILED: ${(e as Error).message.slice(0, 120)}`;
  }

  return NextResponse.json(report);
}
