import { adminAuth } from "./firebase/admin";
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
