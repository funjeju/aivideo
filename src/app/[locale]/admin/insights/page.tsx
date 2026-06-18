"use client";

import { useEffect, useState } from "react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";

interface RedditTopic {
  id: string;
  topic: string;
  subtopic: string;
  appear_count: number;
  first_seen: string;
  last_seen: string;
  platforms: string[];
  recent_growth_rate: number;
  status: "DRAFT" | "OFFICIAL";
}

export default function InsightsAdminPage() {
  const [topics, setTopics] = useState<RedditTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "DRAFT" | "OFFICIAL">("ALL");

  useEffect(() => {
    // 1. reddit_topics 컬렉션 구독 (appear_count 내림차순)
    const q = query(collection(db, "reddit_topics"), orderBy("appear_count", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RedditTopic));
      setTopics(data);
      setLoading(false);
    }, (err) => {
      console.error("Failed to fetch reddit topics:", err);
      setLoading(false);
    });

    return unsub;
  }, []);

  async function approveTopic(id: string) {
    try {
      await updateDoc(doc(db, "reddit_topics", id), { status: "OFFICIAL" });
    } catch (e) {
      console.error(e);
      alert("승인 실패");
    }
  }

  const filteredTopics = topics.filter(t => filter === "ALL" || t.status === filter);

  if (loading) {
    return <div className="p-6">불러오는 중...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--ink)]">인사이트 DB (Reddit)</h1>
          <p className="text-sm text-[var(--ink-soft)] mt-1">
            수집된 외국인 한국 인식 데이터입니다. 승인된 토픽은 향후 영상 생성 소스로 사용됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          {(["ALL", "DRAFT", "OFFICIAL"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                filter === f
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--paper-sunken)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
            >
              {f === "ALL" ? "전체" : f === "DRAFT" ? "승인 대기 (Draft)" : "정식 등록 (Official)"}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[var(--paper-raised)] border border-[var(--line)] rounded-[var(--radius)] overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--paper-sunken)] border-b border-[var(--line)]">
            <tr>
              <th className="p-3 font-medium text-[var(--ink-soft)] w-20">상태</th>
              <th className="p-3 font-medium text-[var(--ink-soft)]">주제 (Topic)</th>
              <th className="p-3 font-medium text-[var(--ink-soft)]">세부 주제 (Subtopic)</th>
              <th className="p-3 font-medium text-[var(--ink-soft)] text-right">등장 횟수</th>
              <th className="p-3 font-medium text-[var(--ink-soft)] text-right">최근 증가율</th>
              <th className="p-3 font-medium text-[var(--ink-soft)]">기간 / 플랫폼</th>
              <th className="p-3 font-medium text-[var(--ink-soft)] text-right">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {filteredTopics.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[var(--ink-faint)]">
                  데이터가 없습니다. 스크래퍼를 실행하여 데이터를 수집하세요.
                </td>
              </tr>
            ) : (
              filteredTopics.map((topic) => (
                <tr key={topic.id} className="hover:bg-[var(--paper-sunken)]/50 transition-colors">
                  <td className="p-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                      topic.status === "OFFICIAL" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {topic.status}
                    </span>
                  </td>
                  <td className="p-3 font-medium text-[var(--ink)]">{topic.topic}</td>
                  <td className="p-3 text-[var(--ink-soft)]">{topic.subtopic}</td>
                  <td className="p-3 text-right font-semibold text-[var(--ink)] tabular-nums">
                    {topic.appear_count.toLocaleString()}회
                  </td>
                  <td className="p-3 text-right tabular-nums text-[var(--ink-soft)]">
                    {topic.recent_growth_rate > 0 ? (
                      <span className="text-red-500">+{topic.recent_growth_rate}%</span>
                    ) : (
                      <span className="text-blue-500">{topic.recent_growth_rate}%</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="text-xs text-[var(--ink-soft)]">
                      {topic.first_seen} ~ {topic.last_seen}
                    </div>
                    <div className="text-[10px] text-[var(--ink-faint)] mt-0.5 truncate max-w-[150px]">
                      {topic.platforms.join(", ")}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    {topic.status === "DRAFT" ? (
                      <Button size="sm" onClick={() => approveTopic(topic.id)}>
                        승인
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => alert("영상 생성 연결 준비 중")}>
                        영상화
                      </Button>
                    )}
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
