"use client";

// Market scanner — multi-venue, with funding rates tab.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ScanResult } from "@/lib/types";
import { formatPrice } from "./Watchlist";

type Tab = "gainers" | "losers" | "top_volume" | "top_funding";
const VENUES = ["binance", "okx", "bybit"];

export default function ScannerPanel({ onSelect }: { onSelect: (s: string) => void }) {
  const [data, setData] = useState<ScanResult | null>(null);
  const [tab, setTab] = useState<Tab>("gainers");
  const [venue, setVenue] = useState("binance");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.scanner(venue);
        if (!cancelled) setData(res);
      } catch {
        /* keep old */
      }
    }
    load();
    const id = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [venue]);

  if (!data) {
    return <div className="p-4 text-sm text-muted">Đang quét thị trường...</div>;
  }

  const rows =
    tab === "top_funding"
      ? data.top_funding.map((f) => ({
          symbol: f.symbol,
          last_price: 0,
          change_pct: f.funding_rate,
          quote_volume: 0,
          high_24h: 0,
          low_24h: 0,
          volume: 0,
          funding_rate: f.funding_rate,
        }))
      : data[tab];

  return (
    <div className="flex h-full flex-col">
      {/* Venue selector */}
      <div className="flex gap-1 border-b border-bg-border px-2 py-1.5">
        {VENUES.map((v) => (
          <button
            key={v}
            onClick={() => setVenue(v)}
            className={`rounded px-2 py-0.5 text-xs ${
              venue === v ? "bg-accent/20 text-accent" : "text-muted hover:bg-bg-hover"
            }`}
          >
            {v}
          </button>
        ))}
        <span className="ml-auto pr-1 text-[10px] text-muted">
          {data.total_symbols} cặp
        </span>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-bg-border px-2 py-1.5">
        {(
          [
            ["gainers", "🚀 Tăng"],
            ["losers", "🔻 Giảm"],
            ["top_volume", "💰 Vol"],
            ["top_funding", "💸 Funding"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded px-2 py-1 text-xs ${
              tab === id ? "bg-accent/20 text-accent" : "text-muted hover:bg-bg-hover"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((t) => (
          <button
            key={t.symbol}
            onClick={() => onSelect(t.symbol)}
            className="grid w-full grid-cols-[1fr_auto_auto] gap-x-3 px-3 py-1.5 text-left text-xs font-mono hover:bg-bg-hover"
          >
            <span className="truncate">{t.symbol.replace("USDT", "")}</span>
            {tab === "top_funding" ? (
              <>
                <span />
                <span
                  className={`w-16 text-right tabular-nums ${
                    t.funding_rate! >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {t.funding_rate! >= 0 ? "+" : ""}
                  {(t.funding_rate! * 100).toFixed(3)}%
                </span>
              </>
            ) : (
              <>
                <span className="text-right tabular-nums">{formatPrice(t.last_price)}</span>
                <span
                  className={`w-16 text-right tabular-nums ${
                    t.change_pct >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {t.change_pct >= 0 ? "+" : ""}
                  {t.change_pct.toFixed(2)}%
                </span>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}