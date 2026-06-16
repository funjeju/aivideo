import { CloudTasksClient } from "@google-cloud/tasks";

/**
 * 렌더 작업을 Cloud Tasks 큐에 적재한다.
 *
 * 왜 큐인가:
 * - 워커는 이제 "렌더 끝날 때까지 응답을 미루는" 동기 구조다(202 조기응답 폐기).
 *   그래야 Cloud Run이 인스턴스를 "바쁨"으로 보고 동시 요청마다 새 인스턴스를 띄운다
 *   (concurrency=1 + 오토스케일 = 진짜 병렬).
 * - 그런데 워커가 응답을 몇 분간 미루면 Vercel(maxDuration)이 끊긴다.
 *   그래서 Vercel은 "큐에 적재"만 하고 즉시 반환하고, Cloud Tasks가 워커에
 *   안정적으로(재시도 포함) 전달한다.
 *
 * env 미설정(로컬 dev)이면 false 반환 → 호출부가 직접 fetch로 폴백.
 */
const DEFAULT_WORKER_URL =
  "https://aivideo-render-worker-328519096392.asia-northeast3.run.app";

function saCredentials(): { client_email: string; private_key: string } | undefined {
  const raw = process.env.FIREBASE_ADMIN_SA_KEY;
  if (!raw) return undefined;
  try {
    const sa = JSON.parse(raw);
    return { client_email: sa.client_email, private_key: sa.private_key };
  } catch {
    return undefined;
  }
}

let _client: CloudTasksClient | null = null;
function client(): CloudTasksClient {
  if (_client) return _client;
  const credentials = saCredentials();
  _client = new CloudTasksClient(
    credentials
      ? { projectId: process.env.GCP_PROJECT_ID, credentials }
      : { projectId: process.env.GCP_PROJECT_ID }
  );
  return _client;
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
  const parent = client().queuePath(project, location, queue);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.WORKER_SECRET) headers["x-worker-secret"] = process.env.WORKER_SECRET;

  await client().createTask({
    parent,
    task: {
      // 렌더는 길다(수 분). 워커가 응답을 끝까지 미루므로 디스패치 데드라인을 넉넉히.
      dispatchDeadline: { seconds: 1800 },
      httpRequest: {
        httpMethod: "POST",
        url: `${workerUrl()}/render`,
        headers,
        body: Buffer.from(JSON.stringify({ jobId, projectId })).toString("base64"),
      },
    },
  });
}
