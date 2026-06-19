"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";

interface RedditRaw {
  id: string;
  reddit_id: string;
  subreddit: string;
  title: string;
  ups: number;
  comments_count: number;
  post_date: string;
  selftext: string;
  top_comments: any[];
  analyzed: boolean;
}

export default function InsightsAdminPage() {
  const [posts, setPosts] = useState<RedditRaw[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 수동 스크래퍼 상태
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeTime, setScrapeTime] = useState("year");
  const [scrapeLimit, setScrapeLimit] = useState(50);

  // 정렬 상태 (client-side)
  const [sortBy, setSortBy] = useState<"date" | "ups" | "comments">("ups");

  useEffect(() => {
    // 가장 최근 수집된 데이터 500개를 가져와서 클라이언트에서 정렬
    const q = query(collection(db, "reddit_raw"), orderBy("post_date", "desc"), limit(500));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RedditRaw));
      setPosts(data);
      setLoading(false);
    }, (err) => {
      console.error("Failed to fetch reddit raw:", err);
      setLoading(false);
    });

    return unsub;
  }, []);

  const sortedPosts = useMemo(() => {
    const arr = [...posts];
    if (sortBy === "ups") arr.sort((a, b) => b.ups - a.ups);
    else if (sortBy === "comments") arr.sort((a, b) => b.comments_count - a.comments_count);
    else arr.sort((a, b) => new Date(b.post_date).getTime() - new Date(a.post_date).getTime());
    return arr;
  }, [posts, sortBy]);

  async function triggerScrape() {
    if (!confirm(`'${scrapeTime}' 기간의 데이터를 ${scrapeLimit}개 수집합니다. 진행하시겠습니까?`)) return;
    setIsScraping(true);
    try {
      const res = await fetch("/api/admin/reddit-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeFilter: scrapeTime, limit: scrapeLimit })
      });
      if (res.ok) {
        alert("원문 스크래핑이 시작되었습니다. 수집되는 대로 테이블에 표시됩니다.");
      } else {
        alert("실행 실패");
      }
    } catch (e) {
      console.error(e);
      alert("네트워크 오류");
    } finally {
      setIsScraping(false);
    }
  }

  async function triggerAnalyze(post: RedditRaw) {
    alert("AI 분석 파이프라인 호출 예정: " + post.id);
    // TODO: AI API 호출 후 analyzed = true 처리
  }

  if (loading) {
    return <div className="p-6">데이터 불러오는 중...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--ink)]">인사이트 원문 DB (Reddit Raw)</h1>
          <p className="text-sm text-[var(--ink-soft)] mt-1 mb-4">
            AI 분석을 거치지 않고 Reddit에서 순수하게 긁어온 원문(Raw Data)입니다. (최신 500개)
          </p>
          <div className="flex items-center gap-2 mb-2 p-3 bg-[var(--paper-sunken)] rounded-lg border border-[var(--line)] w-fit">
            <span className="text-xs font-medium text-[var(--ink)]">수동 수집 실행:</span>
            <select 
              value={scrapeTime} 
              onChange={e => setScrapeTime(e.target.value)}
              className="text-xs p-1 rounded border border-[var(--line)] bg-[var(--paper)]"
            >
              <option value="day">오늘 (Day)</option>
              <option value="week">이번 주 (Week)</option>
              <option value="month">이번 달 (Month)</option>
              <option value="year">올해 (Year)</option>
              <option value="all">전체 (All Time)</option>
            </select>
            <select 
              value={scrapeLimit} 
              onChange={e => setScrapeLimit(Number(e.target.value))}
              className="text-xs p-1 rounded border border-[var(--line)] bg-[var(--paper)]"
            >
              <option value={50}>50개</option>
              <option value={200}>200개</option>
              <option value={500}>500개</option>
              <option value={1000}>1000개(최대)</option>
            </select>
            <Button size="sm" onClick={triggerScrape} disabled={isScraping} className="h-7 text-xs">
              {isScraping ? "수집 요청 중..." : "스크래퍼 시작"}
            </Button>
          </div>
        </div>
        
        {/* 정렬 버튼 */}
        <div className="flex gap-2 self-end">
          <span className="text-xs text-[var(--ink-soft)] self-center mr-1">정렬:</span>
          {(["date", "ups", "comments"] as const).map(f => (
            <button
              key={f}
              onClick={() => setSortBy(f)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                sortBy === f
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--paper-sunken)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
            >
              {f === "date" ? "최신순" : f === "ups" ? "좋아요순" : "댓글순"}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-[var(--radius)] overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--paper-sunken)] border-b border-[var(--line)]">
            <tr>
              <th className="p-3 font-medium text-[var(--ink-soft)] w-24">상태</th>
              <th className="p-3 font-medium text-[var(--ink-soft)] w-24">커뮤니티</th>
              <th className="p-3 font-medium text-[var(--ink-soft)]">제목 (Title)</th>
              <th className="p-3 font-medium text-[var(--ink-soft)] text-right w-24">👍 좋아요</th>
              <th className="p-3 font-medium text-[var(--ink-soft)] text-right w-24">💬 댓글수</th>
              <th className="p-3 font-medium text-[var(--ink-soft)] text-right w-28">AI 분석</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {sortedPosts.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-[var(--ink-faint)]">
                  데이터가 없습니다. 스크래퍼를 실행하여 원문을 수집하세요.
                </td>
              </tr>
            ) : (
              sortedPosts.map((post) => (
                <tr key={post.id} className="hover:bg-[var(--paper-sunken)]/50 transition-colors">
                  <td className="p-3">
                    <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${
                      post.analyzed ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                    }`}>
                      {post.analyzed ? "분석완료" : "미분석"}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-[var(--ink-soft)]">r/{post.subreddit}</td>
                  <td className="p-3">
                    <div className="font-medium text-[var(--ink)] line-clamp-2" title={post.title}>
                      {post.title}
                    </div>
                    <div className="text-[10px] text-[var(--ink-faint)] mt-1 truncate max-w-xl">
                      {post.selftext || "(본문 없음)"}
                    </div>
                  </td>
                  <td className="p-3 text-right font-semibold text-red-500 tabular-nums">
                    {post.ups.toLocaleString()}
                  </td>
                  <td className="p-3 text-right font-semibold text-blue-500 tabular-nums">
                    {post.comments_count.toLocaleString()}
                  </td>
                  <td className="p-3 text-right">
                    <Button 
                      size="sm" 
                      variant={post.analyzed ? "outline" : "default"}
                      onClick={() => triggerAnalyze(post)}
                      className="h-7 text-xs"
                    >
                      {post.analyzed ? "재분석" : "AI 분석"}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
