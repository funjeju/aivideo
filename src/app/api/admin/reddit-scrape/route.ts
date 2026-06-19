import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const { timeFilter = "year", limit = 50 } = await req.json();
    
    // 비동기로 백그라운드 스크립트 실행
    const cwd = path.join(process.cwd(), "scripts", "reddit-scraper");

    console.log(`Starting manual scrape job: node index.js --time ${timeFilter} --limit ${limit}`);
    
    exec(`node index.js --time ${timeFilter} --limit ${limit}`, { cwd }, (error, stdout, stderr) => {
      if (error) {
        console.error("Scraper exec error:", error);
        return;
      }
      console.log("Scraper finished:\n", stdout);
      if (stderr) console.error("Scraper stderr:\n", stderr);
    });

    return NextResponse.json({ success: true, message: "Scraper started in background" });
  } catch (e) {
    console.error("Failed to start scraper:", e);
    return NextResponse.json({ error: "Failed to start scraper" }, { status: 500 });
  }
}
