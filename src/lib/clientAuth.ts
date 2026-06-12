import { auth } from "./firebase/client";

/** 현재 로그인 사용자의 Firebase ID 토큰. 서버 API 호출 시 Authorization 헤더에 사용. */
export async function getIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("not signed in");
  return user.getIdToken();
}
