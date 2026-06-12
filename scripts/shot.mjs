// 로컬 페이지 스크린샷 (검증용)
import puppeteer from "../worker/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js";

const url = process.argv[2] ?? "http://localhost:3000/ko";
const out = process.argv[3] ?? "scripts/shot.png";

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1600 });
await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("✅ 스크린샷:", out);
