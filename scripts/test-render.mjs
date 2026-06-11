// Worker 렌더 직접 호출 — mp4 생성 검증
import { readFileSync } from "node:fs";

// worker/.env 로드 → process.env 주입
const envText = readFileSync(new URL("../worker/.env", import.meta.url), "utf-8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

const projectId = process.argv[2];
if (!projectId) {
  console.error("사용법: node scripts/test-render.mjs <projectId>");
  process.exit(1);
}

const { renderProject } = await import("../worker/dist/render.js");

console.log("렌더 시작:", projectId);
console.time("전체 렌더");
try {
  const result = await renderProject(projectId, (pct) => {
    process.stdout.write(`\r진행률: ${pct}%   `);
  });
  console.log("\n");
  console.timeEnd("전체 렌더");
  console.log("✅ mp4 생성 완료!");
  console.log("   URL:", result.outputUrl);
  console.log("   프레임 수:", result.frameCount);
  console.log("   렌더 시간:", result.renderSeconds.toFixed(1), "초");
} catch (e) {
  console.error("\n❌ 렌더 실패:", e);
}
process.exit(0);
