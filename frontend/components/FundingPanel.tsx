"use client";

// Top funding rates — squeeze detection.
import { useEffect, useState } from "react";

interface FundingRow {
  symbol: string;
  funding_rate: number;
}

export default function FundingPanel({
  onSelect,
}: {
  onSelect: (s: string) => void;
}) {
  const [rows, setRows] = useState<FundingRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/scanner?venue=binance").then((x) =>
          x.json()
        );
        if (!cancelled && Array.isArray(r.top_funding)) setRows(r.top_funding);
      } catch {
        /* keep old */
      }
    }
    load();
    const id = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <p className="border-b border-bg-border px-3 py-1.5 text-[10px] leading-snug text-muted">
        💸 Funding rate cực <b className="text-down">âm</b> → shorts đông, dễ
        short squeeze. Cực <b className="text-up">dương</b> → longs đông, dễ
        long squeeze. (8h/lần)
      </p>
      {rows.map((f) => {
        const extreme = Math.abs(f.funding_rate) >= 0.1;
        return (
          <button
            key={f.symbol}
            onClick={() => onSelect(f.symbol)}
            className="flex items-center justify-between px-3 py-1.5 text-xs font-mono hover:bg-bg-hover"
          >
            <span className="truncate">
              {extreme && "⚡ "}
              {f.symbol.replace("USDT", "")}
            </span>
            <span
              className={`tabular-nums ${
                f.funding_rate >= 0 ? "text-up" : "text-down"
              } ${extreme ? "font-bold" : ""}`}
            >
              {f.funding_rate >= 0 ? "+" : ""}
              {(f.funding_rate * 100).toFixed(3)}%
            </span>
          </button>
        );
      })}
      {rows.length === 0 && (
        <p className="p-4 text-center text-xs text-muted">Đang tải...</p>
      )}
    </div>
  );
}