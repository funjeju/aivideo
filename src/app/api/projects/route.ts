import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { authorizeRequest } from "@/lib/auth";
import { MIN_LENGTH, MAX_LENGTH } from "@/lib/length";
import { maxLengthForUser } from "@/lib/billing";

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeRequest(req);
    if (!auth || !auth.uid) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    // ownerId는 클라이언트 값이 아니라 검증된 토큰의 uid를 사용
    const ownerId = auth.uid;

    const formData = await req.formData();
    const mode = formData.get("mode") as string;
    const topic = formData.get("topic") as string | null;
    let targetLength = Math.min(
      MAX_LENGTH,
      Math.max(MIN_LENGTH, Math.round(Number(formData.get("targetLength") ?? 180)) || 180)
    );
    // 등급별 최대 길이 강제(무료 1분 / Lite 5분 / Pro·VIP 10분). 면제는 무제한.
    const me = (await adminDb().collection("users").doc(ownerId).get()).data();
    targetLength = Math.min(targetLength, maxLengthForUser(me));
    const aspect = (formData.get("aspect") as string) ?? "9:16";
    const stylePackId = formData.get("stylePackId") as string ?? "whiteboard";
    const voiceId = formData.get("voiceId") as string ?? "nova";
    const contentLocale = formData.get("contentLocale") as string ?? "ko";
    const file = formData.get("file") as File | null;

    // 업소용(기업) 영상 브랜드 메타 — 있으면 매 장면 이미지에 사명/로고 반영
    const companyKo = (formData.get("companyKo") as string | null)?.trim() ?? "";
    const companyEn = (formData.get("companyEn") as string | null)?.trim() ?? "";
    const useLogoRef = formData.get("useLogoRef") === "true";
    const logo = formData.get("logo") as File | null;
    const photos = formData.getAll("photos") as File[];
    const photoLabels = formData.getAll("photoLabels") as string[];

    if (!mode) {
      return NextResponse.json({ error: "mode required" }, { status: 400 });
    }

    // 붙여넣은 원고(파일 없이 textarea로 직접 입력) — faithful에서 파일 대신 사용
    const pastedSource = (formData.get("sourceText") as string | null)?.trim() ?? "";

    let sourceText = pastedSource;
    let sourceFileUrl = "";

    if (mode === "faithful" && file) {
      // 파일 텍스트 추출
      const { extractText } = await import("@/lib/pipeline/extractText");
      sourceText = await extractText(file);

      // Storage 업로드
      const buffer = Buffer.from(await file.arrayBuffer());
      const bucket = adminStorage().bucket();
      const filePath = `uploads/${ownerId}/${Date.now()}_${file.name}`;
      const storageFile = bucket.file(filePath);
      await storageFile.save(buffer, { metadata: { contentType: file.type } });
      await storageFile.makePublic();
      sourceFileUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    }

    // 업소용 브랜드: 사명·로고·업소 사진 중 하나라도 있으면 corporate 메타 구성
    let corporate:
      | { companyKo: string; companyEn: string; logoUrl: string; useLogoRef: boolean; photos: { url: string; label: string }[] }
      | undefined;
    if (companyKo || companyEn || logo || photos.length > 0) {
      const bucket = adminStorage().bucket();
      let logoUrl = "";
      if (logo) {
        const buffer = Buffer.from(await logo.arrayBuffer());
        const filePath = `logos/${ownerId}/${Date.now()}_${logo.name}`;
        const storageFile = bucket.file(filePath);
        await storageFile.save(buffer, { metadata: { contentType: logo.type } });
        await storageFile.makePublic();
        logoUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
      }
      // 업소 실제 사진들 업로드(+라벨)
      const uploadedPhotos: { url: string; label: string }[] = [];
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        if (!p || typeof p === "string") continue;
        const buffer = Buffer.from(await p.arrayBuffer());
        const filePath = `corp-photos/${ownerId}/${Date.now()}_${i}_${p.name}`;
        const storageFile = bucket.file(filePath);
        await storageFile.save(buffer, { metadata: { contentType: p.type } });
        await storageFile.makePublic();
        uploadedPhotos.push({
          url: `https://storage.googleapis.com/${bucket.name}/${filePath}`,
          label: (photoLabels[i] ?? "").toString().trim(),
        });
      }
      corporate = { companyKo, companyEn, logoUrl, useLogoRef: useLogoRef && !!logoUrl, photos: uploadedPhotos };
    }

    // 캐릭터 참조 이미지(전역 1장) — 인물의 "느낌"만 참고해 등장 장면에 반영. 실사·애니 무관.
    let characterRefUrl = "";
    const charRef = formData.get("characterRef") as File | null;
    if (charRef) {
      const bucket = adminStorage().bucket();
      const buffer = Buffer.from(await charRef.arrayBuffer());
      const filePath = `char-refs/${ownerId}/${Date.now()}_${charRef.name}`;
      const storageFile = bucket.file(filePath);
      await storageFile.save(buffer, { metadata: { contentType: charRef.type } });
      await storageFile.makePublic();
      characterRefUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    }

    const db = adminDb();
    const docRef = await db.collection("projects").add({
      ownerId,
      title: topic || companyKo || companyEn || file?.name || "새 프로젝트",
      mode,
      sourceText,
      sourceFileUrl,
      targetLength,
      aspect,
      stylePackId,
      voiceId,
      contentLocale,
      ...(corporate ? { corporate } : {}),
      ...(characterRefUrl ? { characterRefUrl } : {}),
      status: "draft",
      scriptApproved: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ projectId: docRef.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "project creation failed" }, { status: 500 });
  }
}
