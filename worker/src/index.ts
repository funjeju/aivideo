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

      await jobRef.update({
        status: "running",
        progress: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // 비동기 렌더 (응답은 즉시, 진행률은 Firestore로)
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ accepted: true, jobId }));

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
      } catch (renderErr) {
        const msg = String(renderErr);
        if (msg.includes("RENDER_CANCELLED")) {
          // 사용자 취소 — 프로젝트는 renderProject가 이미 done으로 되돌림. 잡만 cancelled.
          await jobRef.update({ status: "cancelled", updatedAt: FieldValue.serverTimestamp() });
        } else {
          console.error("render failed:", renderErr);
          await jobRef.update({ status: "error", error: msg, updatedAt: FieldValue.serverTimestamp() });
          await firestore.collection("projects").doc(projectId).update({
            status: "error",
            updatedAt: FieldValue.serverTimestamp(),
          });
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
