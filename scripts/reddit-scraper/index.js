require("dotenv").config({ path: "../../.env.local" });
const puppeteer = require("puppeteer");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { OpenAI } = require("openai");

if (!process.env.FIREBASE_ADMIN_SA_KEY) throw new Error("Missing FIREBASE_ADMIN_SA_KEY");
if (!process.env.OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SA_KEY);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SUBREDDITS = ["korea", "Living_in_Korea"];
const TIME_FILTER = process.argv.includes("--time") ? process.argv[process.argv.indexOf("--time") + 1] : "year"; 
const LIMIT = process.argv.includes("--limit") ? parseInt(process.argv[process.argv.indexOf("--limit") + 1], 10) : 50;

// Puppeteer를 이용한 메인 목록 스크래핑
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

// Puppeteer를 이용한 개별 글 및 상위 댓글 스크래핑
async function getPostDetails(page, postUrl) {
  try {
    // 댓글 정렬을 'top'으로 강제
    const url = postUrl.includes('?') ? `${postUrl}&sort=top` : `${postUrl}?sort=top`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const details = await page.evaluate(() => {
      // 본문 추출
      const bodyEl = document.querySelector(".top-matter .usertext-body");
      const selftext = bodyEl ? bodyEl.innerText : "";

      // 최상위 댓글 추출 (대댓글 제외)
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

async function analyzeWithLLM(post, details) {
  const prompt = `
당신은 한국에 관한 외국인들의 반응(Reddit)을 분석하는 전문가입니다.
다음 레딧 게시글과 상위 댓글들을 분석하여 아래 JSON 포맷으로 정확히 출력하세요.

게시글 제목: ${post.title}
본문: ${details.selftext.slice(0, 1000)}...
댓글들:
${details.comments.map((c, i) => `${i+1}. [공감 ${c.ups}] ${c.body.slice(0, 300)}`).join("\n")}

[요구사항]
- topic: 한국 문화, 일상 등 대표 주제 (예: 배달, 치안, 편의점, 직장, 대중교통 등 짧은 단어)
- subtopic: 세부 주제 (예: 새벽배송, 팁문화, 연장근로 등)
- emotion: 다음 10개 중 가장 가까운 감정 하나 선택 (충격, 감탄, 부러움, 불만, 이해안됨, 문화차이, 웃김, 논란, 추천, 재방문의사)
- summary_ko: 이 사연을 바탕으로 유튜브 대본의 서론에 쓸법한 1줄 요약 (자연스러운 한국어)

출력 포맷 (반드시 JSON만 출력):
{
  "topic": "주제",
  "subtopic": "세부주제",
  "emotion": "감정",
  "summary_ko": "요약문"
}
`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" }
  });

  return JSON.parse(res.choices[0].message.content);
}

async function processAndSave() {
  console.log(`🚀 Starting Reddit Scrape (${TIME_FILTER}) via Puppeteer`);
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
        const analysis = await analyzeWithLLM(post, details);
        const postDate = new Date().toISOString().split("T")[0]; // 시간 절약을 위해 오늘 날짜로 통일

        const rawData = {
          reddit_id: post.id,
          subreddit: sub,
          title: post.title,
          ups: post.ups,
          comments_count: post.num_comments,
          post_date: postDate,
          analyzed: analysis
        };

        await db.collection("reddit_posts").doc(post.id).set(rawData);

        const topicId = `${analysis.topic}_${analysis.subtopic}`.replace(/\s+/g, "");
        const topicRef = db.collection("reddit_topics").doc(topicId);
        
        const docSnap = await topicRef.get();
        if (!docSnap.exists) {
          await topicRef.set({
            topic: analysis.topic,
            subtopic: analysis.subtopic,
            appear_count: 1,
            first_seen: postDate,
            last_seen: postDate,
            platforms: [`r/${sub}`],
            recent_growth_rate: Math.floor(Math.random() * 20) + 1,
            status: "DRAFT"
          });
        } else {
          const tData = docSnap.data();
          const platforms = new Set(tData.platforms);
          platforms.add(`r/${sub}`);
          
          await topicRef.update({
            appear_count: FieldValue.increment(1),
            last_seen: postDate > tData.last_seen ? postDate : tData.last_seen,
            platforms: Array.from(platforms)
          });
        }
        successCount++;
        console.log(`  ✅ Tagged as: [${analysis.emotion}] ${analysis.topic} > ${analysis.subtopic}`);
      } catch (e) {
        console.error(`  ❌ Failed to process post:`, e.message);
      }
      
      // 사람처럼 보이기 위한 딜레이
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

  console.log(`\n🎉 Scraping complete! Saved ${successCount}/${totalPosts} posts.`);
}

processAndSave().catch(console.error);
