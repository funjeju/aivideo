import crypto from "node:crypto";

// Standard Webhooks 서명으로 웹훅 엔드포인트를 검증한다.
// 사용: node --env-file=.env.local scripts/webhook-test.mjs [url]
const url = process.argv[2] || "https://easyshorts.net/api/billing/webhook";
const secretRaw = process.env.PORTONE_WEBHOOK_SECRET || "";
const key = secretRaw.startsWith("whsec_") ? secretRaw.slice(6) : secretRaw;
const keyBytes = Buffer.from(key, "base64");

const id = "msg_test_" + Date.now();
const timestamp = Math.floor(Date.now() / 1000).toString();
const body = JSON.stringify({ type: "Test", data: { paymentId: "test_ping" } });

const sig = crypto.createHmac("sha256", keyBytes).update(`${id}.${timestamp}.${body}`).digest("base64");

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${sig}`,
  },
  body,
});
console.log("URL:", url);
console.log("HTTP:", res.status, res.status === 200 ? "✅ 서명 검증 통과(시크릿 일치)" : res.status === 401 ? "❌ 서명 불일치(Vercel env 미반영/미재배포 가능)" : "");
console.log("BODY:", await res.text());
