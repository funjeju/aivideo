import "dotenv/config";
import { createServer } from "node:http";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { renderProject } from "./render.js";

const PORT = Number(process.env.PORT ?? 8080);

function db() {
  if (getApps().length === 0) {
    const saKey = process.env.FIREBASE_ADMIN_SA_KEY;
    if (!saKey) throw new Error("FIREBASE_ADMIN_SA_KEY not set");
    // storageBucket 포함 — 이 init이 먼저 실행되므로 여기 없으면 render의 bucket() 호출이 실패한다
    initializeApp({
      credential: cert(JSON.parse(saKey)),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  }
  return getFirestore();
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

const server = createServer(async (req, res) => {
  // 헬스 체크
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("render worker ok");
    return;
  }

  if (req.method === "POST" && req.url === "/render") {
    let jobId = "";
    try {
      // 공개 엔드포인트라 시크릿으로 보호. Cloud Tasks가 x-worker-secret 헤더를 실어 보낸다.
      // WORKER_SECRET이 설정돼 있을 때만 검증(미설정=로컬 dev는 통과).
      const expected = process.env.WORKER_SECRET;
      if (expected) {
        const got = req.headers["x-worker-secret"];
        if (got !== expected) {
          res.writeHead(401);
          res.end(JSON.stringify({ error: "unauthorized" }));
          return;
        }
      }

      const body = await readBody(req);
      const payload = JSON.parse(body || "{}");
      const projectId: string = payload.projectId;
      jobId = payload.jobId;

      if (!projectId || !jobId) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "projectId, jobId required" }));
        return;
      }

      const firestore = db();
      const jobRef = firestore.collection("renderJobs").doc(jobId);

      // 이미 끝난 잡이면(Cloud Tasks 재시도로 중복 전달) 그냥 200 — 재실행 방지.
      const jobSnap = await jobRef.get();
      const st = jobSnap.data()?.status;
      if (st === "done" || st === "cancelled") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ skipped: true, status: st }));
        return;
      }

      await jobRef.update({
        status: "running",
        progress: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // ★동기 렌더: 응답을 끝까지 미룬다. 이래야 Cloud Run이 인스턴스를 "바쁨"으로 보고
      //   동시 요청마다 새 인스턴스를 띄운다(concurrency=1 + 오토스케일 = 진짜 병렬).
      //   진행률은 그 와중에도 Firestore로 흘려보낸다.
      try {
        const result = await renderProject(projectId, async (pct) => {
          await jobRef.update({ progress: pct, updatedAt: FieldValue.serverTimestamp() });
        });

        // 비용: Cloud Run 대략 추정 (vCPU-초 기준 근사)
        const renderCostUsd = (result.renderSeconds / 60) * 0.05;

        await jobRef.update({
          status: "done",
          progress: 100,
          outputUrl: result.outputUrl,
          "costLog.renderSeconds": Math.round(result.renderSeconds),
          "costLog.renderCostUsd": renderCostUsd,
          updatedAt: FieldValue.serverTimestamp(),
        });

        await firestore.collection("projects").doc(projectId).update({
          status: "done",
          outputUrl: result.outputUrl,
          updatedAt: FieldValue.serverTimestamp(),
        });

        // 성공 → 200 (Cloud Tasks 재시도 안 함)
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ done: true, jobId, outputUrl: result.outputUrl }));
      } catch (renderErr) {
        const msg = String(renderErr);
        if (msg.includes("RENDER_CANCELLED")) {
          // 사용자 취소 — 프로젝트는 renderProject가 이미 done으로 되돌림. 잡만 cancelled.
          // 200으로 응답해 Cloud Tasks가 재시도하지 않게 한다.
          await jobRef.update({ status: "cancelled", updatedAt: FieldValue.serverTimestamp() });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ cancelled: true, jobId }));
        } else {
          console.error("render failed:", renderErr);
          await jobRef.update({ status: "error", error: msg, updatedAt: FieldValue.serverTimestamp() });
          await firestore.collection("projects").doc(projectId).update({
            status: "error",
            updatedAt: FieldValue.serverTimestamp(),
          });
          // 5xx → Cloud Tasks가 max-attempts(3)까지 재시도. 세그먼트 캐시 덕에 재시도는 이어 그림.
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: msg.slice(0, 300), jobId }));
        }
      }
    } catch (e) {
      console.error(e);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: "worker error" }));
      }
    }
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`render worker listening on :${PORT}`);
});
