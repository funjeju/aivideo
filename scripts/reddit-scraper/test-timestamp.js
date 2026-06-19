const puppeteer = require("puppeteer");

async function testTimestamp() {
  const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // Jan 1 2024 to Jan 31 2024
  const url = `https://old.reddit.com/r/korea/search?q=timestamp%3A1704067200..1706745599&restrict_sr=on&sort=top&syntax=cloudsearch`;
  console.log("Loading", url);
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const titles = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".thing")).slice(0, 5).map(el => {
      const title = el.querySelector("a.title");
      const time = el.querySelector("time");
      return {
        title: title ? title.innerText : "",
        datetime: time ? time.getAttribute("datetime") : ""
      };
    });
  });

  console.log(titles);
  await browser.close();
}

testTimestamp();
