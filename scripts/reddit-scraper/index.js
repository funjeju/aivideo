require("dotenv").config({ path: "../../.env.local" });
const puppeteer = require("puppeteer");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

if (!process.env.FIREBASE_ADMIN_SA_KEY) throw new Error("Missing FIREBASE_ADMIN_SA_KEY");

const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SA_KEY);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const SUBREDDITS = ["korea", "Living_in_Korea"];
const TIME_FILTER = process.argv.includes("--time") ? process.argv[process.argv.indexOf("--time") + 1] : "year"; 
const LIMIT = process.argv.includes("--limit") ? parseInt(process.argv[process.argv.indexOf("--limit") + 1], 10) : 50;

async function scrapeReddit(page, subreddit, timeFilter, limit) {
  try {
    const url = `https://old.reddit.com/r/${subreddit}/top/?sort=top&t=${timeFilter}`;
    console.log(`Loading ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const posts = await page.evaluate((maxLimit) => {
      const things = Array.from(document.querySelectorAll("#siteTable > .thing")).slice(0, maxLimit);
      return things.map(t => {
        const titleEl = t.querySelector("a.title");
        const commentsEl = t.querySelector("a.comments");
        const scoreEl = t.querySelector(".score.unvoted");
        
        return {
          id: t.getAttribute("data-fullname"),
          title: titleEl ? titleEl.innerText : "",
          ups: scoreEl ? parseInt(scoreEl.getAttribute("title") || scoreEl.innerText || "0", 10) : 0,
          url: commentsEl ? commentsEl.href : "",
          num_comments: commentsEl ? parseInt((commentsEl.innerText.match(/\d+/) || ["0"])[0], 10) : 0
        };
      }).filter(p => p.url && p.id);
    }, limit);

    return posts;
  } catch (e) {
    console.error(`Failed to load r/${subreddit}:`, e.message);
    return [];
  }
}

async function getPostDetails(page, postUrl) {
  try {
    const url = postUrl.includes('?') ? `${postUrl}&sort=top` : `${postUrl}?sort=top`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const details = await page.evaluate(() => {
      const bodyEl = document.querySelector(".top-matter .usertext-body");
      const selftext = bodyEl ? bodyEl.innerText : "";

      const commentEls = Array.from(document.querySelectorAll(".commentarea > .sitetable > .comment")).slice(0, 3);
      const comments = commentEls.map(c => {
        const body = c.querySelector(".usertext-body");
        const score = c.querySelector(".score.unvoted");
        return {
          body: body ? body.innerText : "",
          ups: score ? score.innerText : "0"
        };
      });

      return { selftext, comments };
    });

    return details;
  } catch (e) {
    console.error(`Failed to load comments for ${postUrl}:`, e.message);
    return { selftext: "", comments: [] };
  }
}

async function processAndSave() {
  console.log(`🚀 Starting Reddit Raw Scrape (${TIME_FILTER}, LIMIT=${LIMIT})`);
  let totalPosts = 0;
  let successCount = 0;

  const browser = await puppeteer.launch({ 
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  for (const sub of SUBREDDITS) {
    console.log(`\n📌 Scraping r/${sub}...`);
    const posts = await scrapeReddit(page, sub, TIME_FILTER, LIMIT);
    totalPosts += posts.length;

    for (const post of posts) {
      console.log(`- Post: ${post.title.slice(0, 50)}...`);
      const details = await getPostDetails(page, post.url);
      
      try {
        const rawData = {
          reddit_id: post.id,
          subreddit: sub,
          title: post.title,
          ups: post.ups,
          comments_count: post.num_comments,
          post_date: new Date().toISOString(),
          selftext: details.selftext,
          top_comments: details.comments,
          analyzed: false
        };

        // 무지성 Raw DB 저장
        await db.collection("reddit_raw").doc(post.id).set(rawData);
        successCount++;
        console.log(`  ✅ Saved to reddit_raw`);
      } catch (e) {
        console.error(`  ❌ Failed to process post:`, e.message);
      }
      
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  await browser.close();

  await db.collection("reddit_scrape_logs").add({
    date: new Date().toISOString(),
    time_filter: TIME_FILTER,
    total_found: totalPosts,
    success_count: successCount,
    fail_count: totalPosts - successCount
  });

  console.log(`\n🎉 Raw Scraping complete! Saved ${successCount}/${totalPosts} posts.`);
}

processAndSave().catch(console.error);
