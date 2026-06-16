import crypto from "node:crypto";

/**
 * 렌더 작업을 Cloud Tasks 큐에 적재한다.
 *
 * 왜 REST + 직접 JWT 서명인가:
 * - @google-cloud/tasks SDK는 gRPC 동적 require라 Vercel 번들/런타임에서
 *   모듈 로드가 불안정하다(함수 로드 단계 크래시 → 500). 그래서 SDK를 쓰지 않고
 *   서비스계정으로 OAuth 토큰을 직접 만들어 Cloud Tasks REST v2를 fetch로 호출한다.
 *   추가 의존성 0, 번들 이슈 0.
 *
 * 구조 배경:
 * - 워커는 동기 렌더(끝까지 응답 보류)라 Vercel에서 직접 await하면 maxDuration 초과.
 *   그래서 Vercel은 큐에 적재만 하고 즉시 반환, Cloud Tasks가 워커에 재시도 포함 전달.
 */
const DEFAULT_WORKER_URL =
  "https://aivideo-render-worker-328519096392.asia-northeast3.run.app";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/cloud-platform";

interface SA {
  client_email: string;
  private_key: string;
}

function sa(): SA | undefined {
  const raw = process.env.FIREBASE_ADMIN_SA_KEY;
  if (!raw) return undefined;
  try {
    const j = JSON.parse(raw);
    // 환경에 따라 개행이 리터럴 "\n"으로 들어올 수 있어 정규화
    return { client_email: j.client_email, private_key: String(j.private_key).replace(/\\n/g, "\n") };
  } catch {
    return undefined;
  }
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 액세스 토큰 캐시 (~50분)
let _token: { value: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (_token && Date.now() < _token.exp - 60_000) return _token.value;
  const cred = sa();
  if (!cred) throw new Error("FIREBASE_ADMIN_SA_KEY missing/invalid");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({ iss: cred.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = b64url(signer.sign(cred.private_key));
  const jwt = `${header}.${claim}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`token exchange ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  _token = { value: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return _token.value;
}

export function tasksConfigured(): boolean {
  return !!(process.env.GCP_PROJECT_ID && process.env.CLOUD_TASKS_QUEUE);
}

export function workerUrl(): string {
  return process.env.RENDER_WORKER_URL || DEFAULT_WORKER_URL;
}

/**
 * 렌더 작업을 큐에 넣는다. tasksConfigured()가 true일 때만 호출할 것.
 */
export async function enqueueRender(jobId: string, projectId: string): Promise<void> {
  const project = process.env.GCP_PROJECT_ID!;
  const location = process.env.CLOUD_TASKS_LOCATION || "asia-northeast3";
  const queue = process.env.CLOUD_TASKS_QUEUE!;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.WORKER_SECRET) headers["x-worker-secret"] = process.env.WORKER_SECRET;

  const token = await accessToken();
  const url = `https://cloudtasks.googleapis.com/v2/projects/${project}/locations/${location}/queues/${queue}/tasks`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      task: {
        // 렌더는 길다(수 분). 워커가 응답을 끝까지 미루므로 디스패치 데드라인을 넉넉히.
        dispatchDeadline: "1800s",
        httpRequest: {
          httpMethod: "POST",
          url: `${workerUrl()}/render`,
          headers,
          body: Buffer.from(JSON.stringify({ jobId, projectId })).toString("base64"),
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`cloud tasks create ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
