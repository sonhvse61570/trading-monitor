"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Ticker } from "@/lib/types";

interface Props {
  tickers: Ticker[];
  selected: string;
  onSelect: (symbol: string) => void;
}

export default function Watchlist({ tickers, selected, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const prevPrices = useRef<Record<string, number>>({});
  const [flashes, setFlashes] = useState<Record<string, "up" | "down">>({});

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return tickers
      .filter((t) => t.symbol.endsWith("USDT"))
      .filter((t) => !q || t.symbol.includes(q))
      .sort((a, b) => b.quote_volume - a.quote_volume)
      .slice(0, 30);
  }, [tickers, query]);

  // Detect price changes → trigger flash animation.
  useEffect(() => {
    const next: Record<string, "up" | "down"> = {};
    let changed = false;
    for (const t of filtered) {
      const prev = prevPrices.current[t.symbol];
      if (prev !== undefined && prev !== t.last_price) {
        next[t.symbol] = t.last_price > prev ? "up" : "down";
        changed = true;
      }
      prevPrices.current[t.symbol] = t.last_price;
    }
    if (changed) {
      setFlashes(next);
      const id = setTimeout(() => setFlashes({}), 650);
      return () => clearTimeout(id);
    }
  }, [filtered]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-bg-border p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm symbol..."
          className="w-full rounded bg-bg-hover px-2 py-1.5 text-sm outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
        />
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-1.5 text-xs text-muted">
        <span>Symbol</span>
        <span className="text-right">Giá</span>
        <span className="text-right">24h%</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.map((t) => (
          <button
            key={t.symbol}
            onClick={() => onSelect(t.symbol)}
            className={`grid w-full grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-1.5 text-left text-sm font-mono hover:bg-bg-hover ${
              t.symbol === selected ? "bg-bg-hover" : ""
            }`}
          >
            <span className="truncate">{t.symbol.replace("USDT", "")}</span>
            <span
              className={`text-right tabular-nums ${
                flashes[t.symbol] === "up"
                  ? "flash-up"
                  : flashes[t.symbol] === "down"
                    ? "flash-down"
                    : ""
              }`}
            >
              {formatPrice(t.last_price)}
            </span>
            <span
              className={`w-16 text-right tabular-nums ${
                t.change_pct >= 0 ? "text-up" : "text-down"
              }`}
            >
              {t.change_pct >= 0 ? "+" : ""}
              {t.change_pct.toFixed(2)}%
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="p-4 text-center text-sm text-muted">Không có kết quả</p>
        )}
      </div>
    </div>
  );
}

export function formatPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (p >= 1) return p.toFixed(3);
  return p.toPrecision(4);
}