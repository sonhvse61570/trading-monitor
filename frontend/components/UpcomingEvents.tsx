"use client";

// Next high-impact economic events — compact chips.
import { useEffect, useState } from "react";

interface CalEvent {
  date: string;
  currency: string;
  event: string;
  impact: string;
}

const FLAGS: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵",
  CNY: "🇨🇳", AUD: "🇦🇺", CAD: "🇨🇦", CHF: "🇨🇭",
};

export default function UpcomingEvents({ max = 4 }: { max?: number }) {
  const [events, setEvents] = useState<CalEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/intel/calendar?impact=high").then((x) =>
          x.json()
        );
        if (!cancelled && Array.isArray(r)) {
          const now = Date.now();
          setEvents(
            r.filter((e: CalEvent) => new Date(e.date).getTime() > now).slice(0, max)
          );
        }
      } catch {
        /* ignore */
      }
    }
    load();
    const id = setInterval(load, 1800000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [max]);

  if (events.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-bg-border bg-bg-panel px-3 py-1 text-[11px]">
      <span className="shrink-0 font-semibold text-down">📅 SẮP TỚI</span>
      {events.map((e, i) => (
        <span
          key={i}
          className="flex shrink-0 items-center gap-1 rounded bg-bg-hover px-1.5 py-0.5"
          title={`${e.event} (${e.impact})`}
        >
          <span>{FLAGS[e.currency] ?? "🌍"}</span>
          <span className="font-mono tabular-nums">
            {new Date(e.date).toLocaleString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span className="max-w-[220px] truncate">{e.event}</span>
        </span>
      ))}
    </div>
  );
}