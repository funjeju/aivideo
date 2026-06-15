import { readFileSync } from "node:fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const pid = process.argv[2];
const origin = process.argv[3] ?? "https://aivideo-nu.vercel.app";
console.log("resuming generate:", pid, "@", origin);
const res = await fetch(`${origin}/api/generate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
  body: JSON.stringify({ projectId: pid }),
});
console.log("status:", res.status);
console.log("body:", await res.text());
process.exit(0);
