"use client";

// Market Intelligence — news, economic calendar, sentiment.
import { useEffect, useState } from "react";
import Link from "next/link";

interface NewsItem {
  source: string;
  title: string;
  link: string;
  published: string;
  summary: string;
}

interface CalEvent {
  date: string;
  country: string;
  currency: string;
  event: string;
  impact: string;
  forecast: string;
  previous: string;
}

interface FngData {
  value: number;
  label: string;
  history: { ts: number; value: number }[];
}

const fngColor = (v: number) =>
  v <= 25 ? "text-down" : v >= 75 ? "text-up" : "text-accent";

export default function IntelPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [fng, setFng] = useState<FngData | null>(null);
  const [impactFilter, setImpactFilter] = useState<"high" | "medium" | "low">("high");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [n, c, f] = await Promise.all([
          fetch("/api/intel/news?limit=25").then((r) => r.json()),
          fetch(`/api/intel/calendar?impact=${impactFilter}`).then((r) => r.json()),
          fetch("/api/intel/fear-greed").then((r) => r.json()),
        ]);
        if (!cancelled) {
          setNews(n);
          setEvents(c);
          setFng(f);
        }
      } catch {
        /* keep old */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 300000); // refresh every 5 min
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [impactFilter]);

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">🌐 Market Intelligence</h1>
        <Link href="/" className="rounded bg-bg-hover px-3 py-1.5 text-sm hover:bg-bg-border">
          ← Dashboard
        </Link>
      </header>

      {/* ===== Sentiment + Calendar side by side ===== */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Fear & Greed */}
        <section className="rounded-lg border border-bg-border bg-bg-panel p-4">
          <h2 className="mb-3 text-sm font-semibold">😱 Fear & Greed Index</h2>
          {fng ? (
            <>
              <div className="flex items-baseline gap-3">
                <span className={`font-mono text-5xl font-bold ${fngColor(fng.value)}`}>
                  {fng.value}
                </span>
                <span className={`text-lg font-semibold ${fngColor(fng.value)}`}>
                  {fng.label}
                </span>
              </div>
              {/* Mini bar history */}
              <div className="mt-4 flex h-16 items-end gap-1">
                {fng.history.map((h) => (
                  <div
                    key={h.ts}
                    title={`${new Date(h.ts * 1000).toLocaleDateString("vi-VN")}: ${h.value}`}
                    style={{ height: `${h.value}%` }}
                    className={`min-w-[8px] flex-1 rounded-t ${
                      h.value >= 75
                        ? "bg-up/70"
                        : h.value <= 25
                          ? "bg-down/70"
                          : "bg-accent/50"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">8 ngày gần nhất</p>
            </>
          ) : (
            <p className="text-sm text-muted">Đang tải...</p>
          )}
        </section>

        {/* Economic calendar */}
        <section className="rounded-lg border border-bg-border bg-bg-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">📅 Lịch kinh tế tuần này</h2>
            <div className="flex gap-1 text-xs">
              {(["high", "medium", "low"] as const).map((lv) => (
                <button
                  key={lv}
                  onClick={() => setImpactFilter(lv)}
                  className={`rounded px-2 py-0.5 ${
                    impactFilter === lv
                      ? "bg-accent/20 text-accent"
                      : "text-muted hover:bg-bg-hover"
                  }`}
                >
                  {lv === "high" ? "🔴 Cao" : lv === "medium" ? "🟡 TB" : "🟢 Thấp"}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-bg-panel text-muted">
                <tr>
                  <th className="py-1 pr-2">Thời gian</th>
                  <th className="pr-2">Tiền</th>
                  <th className="pr-2">Sự kiện</th>
                  <th className="pr-2">Dự báo</th>
                  <th>Trước</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {events.map((e, i) => (
                  <tr key={i} className="border-t border-bg-border/50 hover:bg-bg-hover">
                    <td className="whitespace-nowrap py-1.5 pr-2">{e.date.slice(5, 16)}</td>
                    <td className="pr-2">{e.currency}</td>
                    <td className="pr-2 font-sans">{e.event}</td>
                    <td className="pr-2 tabular-nums">{e.forecast || "—"}</td>
                    <td className="tabular-nums">{e.previous || "—"}</td>
                  </tr>
                ))}
                {events.length === 0 && !loading && (
                  <tr><td colSpan={5} className="py-4 text-center text-muted">Không có sự kiện.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ===== News feed ===== */}
      <section className="overflow-hidden rounded-lg border border-bg-border">
        <h2 className="border-b border-bg-border bg-bg-panel px-4 py-2 text-sm font-semibold">
          📰 Tin tức thị trường
        </h2>
        <div className="divide-y divide-bg-border/50">
          {news.map((n, i) => (
            <a
              key={i}
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-2.5 hover:bg-bg-hover"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">
                  {n.source}
                </span>
                <span className="text-muted">{n.published}</span>
              </div>
              <p className="mt-1 text-sm font-medium leading-snug">{n.title}</p>
              {n.summary && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.summary}</p>
              )}
            </a>
          ))}
          {news.length === 0 && loading && (
            <p className="p-6 text-center text-sm text-muted">Đang tải tin tức...</p>
          )}
        </div>
      </section>
    </main>
  );
}