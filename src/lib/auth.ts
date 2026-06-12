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
