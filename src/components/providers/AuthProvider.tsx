"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { UserDoc } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  userDoc: UserDoc | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  userDoc: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const ref = doc(db, "users", firebaseUser.uid);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            setUserDoc(snap.data() as UserDoc);
          } else {
            // 최초 로그인 — users 문서 생성 (Phase 0 데이터 모델)
            const newDoc = {
              email: firebaseUser.email ?? "",
              displayName: firebaseUser.displayName ?? "",
              plan: "free",
              credits: 0,
              role: "user" as const,
              uiLocale: "ko" as const,
              themePref: "light" as const,
              createdAt: serverTimestamp(),
            };
            await setDoc(ref, newDoc, { merge: true });
            setUserDoc(newDoc as unknown as UserDoc);
          }
        } catch (e) {
          // 보안 규칙 미적용 등으로 users 접근 실패해도 앱이 멈추지 않게 (로딩바 무한 회전 방지)
          console.error("user doc load failed:", e);
          setUserDoc(null);
        }
      } else {
        setUserDoc(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, userDoc, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
