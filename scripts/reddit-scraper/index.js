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
const LIMIT = process.argv.includes("--limit") ? parseInt(process.argv[process.argv.indexOf("--limit") + 1], 10) : 100;

// 한 페이지(old.reddit는 ~25개)에서 글 목록 + 다음 페이지 링크 추출
async function extractListPage(page) {
  return page.evaluate(() => {
    const things = Array.from(document.querySelectorAll("#siteTable > .thing"));
    const posts = things.map(t => {
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
    const nextEl = document.querySelector("span.next-button > a");
    return { posts, next: nextEl ? nextEl.href : null };
  });
}

// 페이지네이션: limit 채울 때까지 "다음" 링크를 따라가며 누적 수집
async function scrapeReddit(page, subreddit, timeFilter, limit) {
  let url = `https://old.reddit.com/r/${subreddit}/top/?sort=top&t=${timeFilter}`;
  const all = [];
  const seen = new Set();
  for (let pageNum = 1; pageNum <= 40 && all.length < limit; pageNum++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (e) {
      console.error(`  page ${pageNum} 로드 실패 (r/${subreddit}):`, e.message);
      break;
    }
    let next = null;
    try {
      const res = await extractListPage(page);
      for (const p of res.posts) { if (!seen.has(p.id)) { seen.add(p.id); all.push(p); } }
      next = res.next;
      console.log(`  page ${pageNum}: +${res.posts.length} (누적 ${all.length}/${limit})`);
    } catch (e) {
      console.error(`  page ${pageNum} 파싱 실패:`, e.message);
      break;
    }
    if (!next || all.length >= limit) break;
    url = next;
    await new Promise(r => setTimeout(r, 1500)); // 페이지 간 딜레이(차단 회피)
  }
  return all.slice(0, limit);
}

async function getPostDetails(page, postUrl) {
  try {
    const url = postUrl.includes('?') ? `${postUrl}&sort=top` : `${postUrl}?sort=top`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const details = await page.evaluate(() => {
      const bodyEl = document.querySelector(".top-matter .usertext-body");
      const selftext = bodyEl ? bodyEl.innerText : "";

      // 상위(top 정렬) 댓글을 넉넉히 — 본문이 사진/링크인 글은 댓글이 곧 콘텐츠라 충분히 긁는다.
      const commentEls = Array.from(document.querySelectorAll(".commentarea > .sitetable > .comment")).slice(0, 40);
      const comments = commentEls.map(c => {
        const body = c.querySelector(".usertext-body");
        const score = c.querySelector(".score.unvoted");
        return {
          body: body ? body.innerText.trim() : "",
          ups: score ? score.innerText : "0"
        };
      })
      // 삭제/빈 댓글 제외, 본문 있는 것만, 최대 25개
      .filter(c => c.body && c.body !== "[deleted]" && c.body !== "[removed]")
      .slice(0, 25);

      return { selftext, comments };
    });

    return details;
  } catch (e) {
    console.error(`Failed to load comments for ${postUrl}:`, e.message);
    return { selftext: "", comments: [] };
  }
}

async function processAndSave() {
  const statusRef = db.collection("system_status").doc("reddit_scraper");
  await statusRef.set({
    isRunning: true,
    timeFilter: TIME_FILTER,
    targetLimit: LIMIT * SUBREDDITS.length,
    successCount: 0,
    currentSubreddit: "준비 중...",
    startTime: new Date().toISOString()
  });

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
    await statusRef.update({ currentSubreddit: `r/${sub}` });
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
        
        await statusRef.update({ successCount });
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

  await statusRef.update({
    isRunning: false,
    successCount,
    currentSubreddit: "수집 완료"
  });

  console.log(`\n🎉 Raw Scraping complete! Saved ${successCount}/${totalPosts} posts.`);
}

processAndSave().catch(console.error);
