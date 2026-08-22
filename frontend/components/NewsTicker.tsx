"use client";

// Horizontal news marquee — Bloomberg-style headline strip.
import { useEffect, useState } from "react";

interface NewsItem {
  source: string;
  title: string;
  link: string;
}

export default function NewsTicker() {
  const [items, setItems] = useState<NewsItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/intel/news?limit=12").then((x) => x.json());
        if (!cancelled && Array.isArray(r)) setItems(r);
      } catch {
        /* keep old */
      }
    }
    load();
    const id = setInterval(load, 300000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (items.length === 0) return null;

  const doubled = [...items, ...items]; // seamless loop

  return (
    <div className="group relative flex h-7 items-center overflow-hidden border-b border-bg-border bg-bg-panel">
      <span className="z-10 flex h-full shrink-0 items-center bg-accent px-2 text-[10px] font-bold text-black">
        📰 TIN
      </span>
      <div className="marquee flex w-max gap-10 pl-6 group-hover:[animation-play-state:paused]">
        {doubled.map((n, i) => (
          <a
            key={i}
            href={n.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-2 text-xs hover:text-accent"
          >
            <span className="rounded bg-bg-hover px-1 py-px text-[10px] text-muted">
              {n.source}
            </span>
            <span className="max-w-lg truncate">{n.title}</span>
            <span className="text-bg-border">•</span>
          </a>
        ))}
      </div>
    </div>
  );
}