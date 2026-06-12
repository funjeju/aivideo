import { NextRequest } from "next/server";
import { adminAuth, adminDb } from "./firebase/admin";
import { UserRole } from "./types";

export async function getSessionRole(idToken: string): Promise<UserRole | null> {
  try {
    const decoded = await adminAuth().verifyIdToken(idToken);
    return (decoded.role as UserRole) ?? "user";
  } catch {
    return null;
  }
}

export function isAdmin(role: UserRole | null | undefined): boolean {
  return role === "staff" || role === "superadmin";
}

export function isSuperAdmin(role: UserRole | null | undefined): boolean {
  return role === "superadmin";
}

export interface AuthedUser {
  uid: string;
  role: UserRole;
}

export interface AuthResult {
  /** 사용자 호출이면 uid, 내부 서버 호출이면 null */
  uid: string | null;
  /** 서버 내부 오케스트레이션 호출 여부 */
  internal: boolean;
}

/**
 * API 라우트 공통 인가.
 * - 내부 호출: x-internal-secret === INTERNAL_API_SECRET
 * - 사용자 호출: Authorization: Bearer <idToken>
 * 둘 다 아니면 null(거부).
 */
export async function authorizeRequest(req: NextRequest): Promise<AuthResult | null> {
  const secret = process.env.INTERNAL_API_SECRET;
  const provided = req.headers.get("x-internal-secret");
  if (secret && provided && provided === secret) {
    return { uid: null, internal: true };
  }
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token) {
    try {
      const decoded = await adminAuth().verifyIdToken(token);
      return { uid: decoded.uid, internal: false };
    } catch {
      return null;
    }
  }
  return null;
}

/** 서버→서버 내부 호출용 헤더 */
export function internalHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
  };
}

/** 인가 결과가 해당 프로젝트의 소유자(또는 내부 호출)인지 확인 */
export async function ownsProject(auth: AuthResult, projectId: string): Promise<boolean> {
  if (auth.internal) return true;
  if (!auth.uid) return false;
  const snap = await adminDb().collection("projects").doc(projectId).get();
  return snap.exists && snap.data()?.ownerId === auth.uid;
}

/**
 * 요청의 Authorization: Bearer <idToken> 검증 → { uid, role }.
 * role은 custom claims 우선, 없으면 users 문서에서 조회.
 * 실패 시 null.
 */
export async function getAuthedUser(req: NextRequest): Promise<AuthedUser | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    let role = decoded.role as UserRole | undefined;
    if (!role) {
      const snap = await adminDb().collection("users").doc(decoded.uid).get();
      role = (snap.data()?.role as UserRole) ?? "user";
    }
    return { uid: decoded.uid, role };
  } catch {
    return null;
  }
}
