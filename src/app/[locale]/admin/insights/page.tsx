"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { useParams, useRouter } from "next/navigation";
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
  analysis?: { topic: string; angle: string; summary: string; worth: number; at: string };
  triage?: { worth: number; cat: string };
}

export default function InsightsAdminPage() {
  const params = useParams();
  const router = useRouter();
  const locale = params.locale as string;
  const [posts, setPosts] = useState<RedditRaw[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 수동 스크래퍼 상태
  const [scrapeTime, setScrapeTime] = useState("year");
  const [scrapeLimit, setScrapeLimit] = useState(50);
  const [systemStatus, setSystemStatus] = useState<any>(null);

  // 정렬 상태 (client-side)
  const [sortBy, setSortBy] = useState<"date" | "ups" | "comments" | "worth">("ups");
  const [onlyWorthy, setOnlyWorthy] = useState(false); // 영상거리(★3+)만 보기
  const [triaging, setTriaging] = useState(false);
  // 펼친 행(본문·댓글 보기)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // AI 분석 진행 중인 행
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

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

    // 스크래퍼 상태 구독
    const statusUnsub = onSnapshot(doc(db, "system_status", "reddit_scraper"), (docSnap) => {
      if (docSnap.exists()) {
        setSystemStatus(docSnap.data());
      }
    });

    return () => {
      unsub();
      statusUnsub();
    };
  }, []);

  const sortedPosts = useMemo(() => {
    let arr = [...posts];
    if (onlyWorthy) arr = arr.filter((p) => (p.triage?.worth ?? 0) >= 3);
    if (sortBy === "ups") arr.sort((a, b) => b.ups - a.ups);
    else if (sortBy === "comments") arr.sort((a, b) => b.comments_count - a.comments_count);
    else if (sortBy === "worth") arr.sort((a, b) => (b.triage?.worth ?? 0) - (a.triage?.worth ?? 0) || b.comments_count - a.comments_count);
    else arr.sort((a, b) => new Date(b.post_date).getTime() - new Date(a.post_date).getTime());
    return arr;
  }, [posts, sortBy, onlyWorthy]);

  async function triggerTriage() {
    if (triaging) return;
    setTriaging(true);
    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      const res = await fetch("/api/admin/insight-triage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { alert("선별 실패"); return; }
      setSortBy("worth"); // 결과를 영상거리순으로 바로 보여줌
    } catch {
      alert("네트워크 오류");
    } finally {
      setTriaging(false);
    }
  }

  function triggerScrape() {
    // Reddit은 비-브라우저/서버 요청을 차단해(403), 수집은 실제 크롬(Puppeteer)이 필요하다.
    // 그래서 배포 서버(Vercel)에선 실행 불가 → 로컬 PC에서 돌려야 한다.
    alert(
      "Reddit 수집은 서버(배포본)에서 실행할 수 없습니다.\n" +
      "Reddit이 서버 요청을 차단하기 때문에 실제 브라우저가 필요합니다.\n\n" +
      "▶ 내 PC에서 실행하세요:\n" +
      "scripts/reddit-scraper/수집실행.bat 더블클릭\n" +
      "(기간·개수 입력 → 자동 수집, 서브레딧당 100개 이상 페이지네이션)\n\n" +
      "수집되면 이 화면에 자동으로 나타납니다."
    );
  }

  async function triggerAnalyze(post: RedditRaw) {
    if (analyzingId) return;
    setAnalyzingId(post.id);
    try {
      const { getIdToken } = await import("@/lib/clientAuth");
      const token = await getIdToken();
      const res = await fetch("/api/admin/insight-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: post.id }),
      });
      if (!res.ok) { alert("분석 실패"); return; }
      setExpandedId(post.id); // 결과 바로 보이게 펼침 (onSnapshot이 analysis 갱신)
    } catch {
      alert("네트워크 오류");
    } finally {
      setAnalyzingId(null);
    }
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
            <Button size="sm" onClick={triggerScrape} disabled={systemStatus?.isRunning} className="h-7 text-xs">
              {systemStatus?.isRunning ? "수집 중..." : "스크래퍼 시작"}
            </Button>
            <Button size="sm" variant="outline" onClick={triggerTriage} disabled={triaging} className="h-7 text-xs" title="제목을 AI로 평가해 영상거리만 골라냄(사진·짤 제외)">
              {triaging ? "선별 중..." : "✨ 자동 선별"}
            </Button>
          </div>
          
          {/* 스크래퍼 실시간 진행 상태 UI */}
          {systemStatus?.isRunning && (
            <div className="mb-4 p-4 border border-blue-200 bg-blue-50 rounded-lg max-w-xl">
              <div className="flex justify-between items-center mb-2">
                <div className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                  <span className="animate-pulse h-2 w-2 bg-blue-600 rounded-full"></span>
                  백그라운드 스크래핑 진행 중...
                </div>
                <div className="text-xs text-blue-600 font-medium">
                  {systemStatus.successCount} / {systemStatus.targetLimit} 완료
                </div>
              </div>
              <div className="w-full bg-blue-100 rounded-full h-2 mb-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out" 
                  style={{ width: `${Math.min(100, (systemStatus.successCount / (systemStatus.targetLimit || 1)) * 100)}%` }}
                ></div>
              </div>
              <div className="text-xs text-blue-600">
                현재 위치: <span className="font-medium">{systemStatus.currentSubreddit}</span>
              </div>
            </div>
          )}

        </div>
        
        {/* 정렬 + 필터 */}
        <div className="flex gap-2 self-end items-center">
          <label className="flex items-center gap-1 text-xs text-[var(--ink-soft)] mr-2 cursor-pointer">
            <input type="checkbox" checked={onlyWorthy} onChange={(e) => setOnlyWorthy(e.target.checked)} className="accent-[var(--accent)]" />
            영상거리만(★3+)
          </label>
          <span className="text-xs text-[var(--ink-soft)] self-center mr-1">정렬:</span>
          {(["worth", "date", "ups", "comments"] as const).map(f => (
            <button
              key={f}
              onClick={() => setSortBy(f)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                sortBy === f
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--paper-sunken)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
            >
              {f === "worth" ? "영상거리순" : f === "date" ? "최신순" : f === "ups" ? "좋아요순" : "댓글순"}
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
              sortedPosts.map((post) => {
                const expanded = expandedId === post.id;
                const comments = Array.isArray(post.top_comments) ? post.top_comments : [];
                return (
                <Fragment key={post.id}>
                <tr
                  className="hover:bg-[var(--paper-sunken)]/50 transition-colors cursor-pointer"
                  onClick={() => setExpandedId(expanded ? null : post.id)}
                >
                  <td className="p-3">
                    <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${
                      post.analyzed ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                    }`}>
                      {post.analyzed ? "분석완료" : "미분석"}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-[var(--ink-soft)]">r/{post.subreddit}</td>
                  <td className="p-3">
                    <div className="font-medium text-[var(--ink)] line-clamp-2 flex items-start gap-1" title={post.title}>
                      <span className="text-[var(--ink-faint)] mt-0.5">{expanded ? "▼" : "▶"}</span>
                      {post.triage && (
                        <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          post.triage.worth >= 4 ? "bg-red-100 text-red-700"
                          : post.triage.worth >= 3 ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-400"
                        }`} title={`영상거리 ${post.triage.worth}/5 · ${post.triage.cat}`}>
                          ★{post.triage.worth} {post.triage.cat}
                        </span>
                      )}
                      <span>{post.title}</span>
                    </div>
                    <div className="text-[10px] text-[var(--ink-faint)] mt-1 truncate max-w-xl pl-4">
                      {post.selftext ? post.selftext : comments.length ? `💬 댓글 ${comments.length}개 — 펼쳐보기` : "(본문 없음)"}
                    </div>
                  </td>
                  <td className="p-3 text-right font-semibold text-red-500 tabular-nums">
                    {post.ups.toLocaleString()}
                  </td>
                  <td className="p-3 text-right font-semibold text-blue-500 tabular-nums">
                    {post.comments_count.toLocaleString()}
                  </td>
                  <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant={post.analyzed ? "outline" : "default"}
                      onClick={() => triggerAnalyze(post)}
                      disabled={analyzingId === post.id}
                      className="h-7 text-xs"
                    >
                      {analyzingId === post.id ? "분석 중..." : post.analyzed ? "재분석" : "AI 분석"}
                    </Button>
                  </td>
                </tr>
                {expanded && (
                  <tr className="bg-[var(--paper-sunken)]/40">
                    <td colSpan={6} className="p-4">
                      <div className="max-w-3xl space-y-3">
                        {post.analysis && (
                          <div className="rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[11px] font-semibold text-[var(--accent)]">🎬 AI 영상 기획</span>
                              <span className="text-[10px] text-[var(--ink-faint)]">영상 가치 {"★".repeat(post.analysis.worth || 0)}{"☆".repeat(5 - (post.analysis.worth || 0))}</span>
                            </div>
                            <div className="text-sm font-semibold text-[var(--ink)]">{post.analysis.topic}</div>
                            <div className="text-xs text-[var(--ink-soft)] mt-0.5">앵글: {post.analysis.angle}</div>
                            <div className="text-xs text-[var(--ink)] mt-1 whitespace-pre-wrap">{post.analysis.summary}</div>
                            <Button
                              size="sm"
                              className="h-7 text-xs mt-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                const a = post.analysis!;
                                const topic = a.summary ? `${a.topic}\n\n참고 내용: ${a.summary}` : a.topic;
                                router.push(`/${locale}/create?topic=${encodeURIComponent(topic)}`);
                              }}
                            >
                              🎬 이 주제로 영상 만들기 →
                            </Button>
                          </div>
                        )}
                        <div>
                          <div className="text-[11px] font-semibold text-[var(--ink-soft)] mb-1">본문</div>
                          <div className="text-xs text-[var(--ink)] whitespace-pre-wrap">
                            {post.selftext?.trim() || <span className="text-[var(--ink-faint)]">(본문 없음 — 사진/링크 글)</span>}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-[var(--ink-soft)] mb-1">인기 댓글 {comments.length}개</div>
                          {comments.length === 0 ? (
                            <div className="text-xs text-[var(--ink-faint)]">(수집된 댓글 없음)</div>
                          ) : (
                            <ul className="space-y-2">
                              {comments.map((c: { body?: string; ups?: string | number }, i: number) => (
                                <li key={i} className="text-xs text-[var(--ink)] border-l-2 border-[var(--line)] pl-2">
                                  <span className="text-[10px] text-[var(--accent)] font-medium mr-1">▲ {c.ups ?? 0}</span>
                                  <span className="whitespace-pre-wrap">{c.body || "(빈 댓글)"}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <a
                          href={`https://reddit.com/${post.reddit_id?.startsWith("t3_") ? "comments/" + post.reddit_id.slice(3) : ""}`}
                          target="_blank" rel="noreferrer"
                          className="inline-block text-[11px] text-[var(--accent)] hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          원본 글 열기 →
                        </a>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
