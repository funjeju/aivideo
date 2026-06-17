import { adminDb } from "@/lib/firebase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: string; id: string }> };

async function loadProject(id: string) {
  try {
    const snap = await adminDb().collection("projects").doc(id).get();
    const p = snap.data();
    if (!p || !p.outputUrl) return null; // 완성된(공개 가능한) 영상만
    return {
      title: (p.title as string) || "Easyshorts 영상",
      hook: (p.thumbnailHook as string) || (p.title as string) || "",
      thumbnailUrl: (p.thumbnailUrl as string) || "",
      outputUrl: (p.outputUrl as string) || "",
      aspect: (p.aspect as string) || "9:16",
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const p = await loadProject(id);
  if (!p) return { title: "Easyshorts" };
  const title = p.hook || p.title;
  const description = p.title;
  return {
    title: `${title} — Easyshorts`,
    description,
    openGraph: {
      title,
      description,
      type: "video.other",
      ...(p.thumbnailUrl ? { images: [{ url: p.thumbnailUrl }] } : {}),
      ...(p.outputUrl ? { videos: [{ url: p.outputUrl }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(p.thumbnailUrl ? { images: [p.thumbnailUrl] } : {}),
    },
  };
}

export default async function SharePage({ params }: Params) {
  const { id, locale } = await params;
  const p = await loadProject(id);
  if (!p) notFound();

  const ratioClass = p.aspect === "16:9" ? "aspect-video" : p.aspect === "1:1" ? "aspect-square" : "aspect-[9/16]";

  return (
    <main className="flex-1 px-6 py-10 max-w-md mx-auto w-full flex flex-col items-center">
      <h1 className="text-xl font-semibold text-[var(--ink)] text-center mb-1">{p.hook || p.title}</h1>
      <p className="text-xs text-[var(--ink-soft)] mb-5">Easyshorts로 만든 영상</p>

      <div className={`w-full ${ratioClass} rounded-[var(--radius)] overflow-hidden bg-black border border-[var(--line)]`}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={p.outputUrl}
          poster={p.thumbnailUrl || undefined}
          controls
          playsInline
          className="w-full h-full object-contain"
        />
      </div>

      <a
        href={p.outputUrl}
        download
        className="mt-4 text-sm text-[var(--accent)] hover:underline"
      >
        영상 내려받기 (mp4)
      </a>

      <div className="mt-8 w-full border-t border-[var(--line)] pt-6 text-center">
        <p className="text-sm text-[var(--ink-soft)] mb-3">주제만 입력하면 이런 영상이 자동으로 만들어져요.</p>
        <Link
          href={`/${locale}/create`}
          className="inline-block px-6 py-3 rounded-[var(--radius)] bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          나도 만들어보기
        </Link>
      </div>
    </main>
  );
}
