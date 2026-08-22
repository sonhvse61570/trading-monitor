"use client";

// Top gainers & losers mini-panel for the sidebar.
import type { Ticker } from "@/lib/types";
import { formatPrice } from "./Watchlist";

export default function MoversPanel({
  tickers,
  selected,
  onSelect,
}: {
  tickers: Ticker[];
  selected: string;
  onSelect: (s: string) => void;
}) {
  const usdt = tickers.filter((t) => t.symbol.endsWith("USDT"));
  const gainers = [...usdt]
    .filter((t) => t.quote_volume > 5e6) // liquid only
    .sort((a, b) => b.change_pct - a.change_pct)
    .slice(0, 8);
  const losers = [...usdt]
    .filter((t) => t.quote_volume > 5e6)
    .sort((a, b) => a.change_pct - b.change_pct)
    .slice(0, 8);

  const sections: [string, Ticker[]][] = [
    ["🚀 TOP TĂNG", gainers],
    ["🔻 TOP GIẢM", losers],
  ];

  return (
    <div className="grid h-full min-h-0 grid-cols-2 divide-x divide-bg-border overflow-y-auto">
      {sections.map(([label, rows]) => (
        <div key={label}>
          <div className="sticky top-0 bg-bg-panel px-2 py-1.5 text-[10px] font-semibold text-muted">
            {label}
          </div>
          {rows.map((t) => (
            <button
              key={t.symbol}
              onClick={() => onSelect(t.symbol)}
              className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-2 px-2 py-1 text-left text-xs font-mono hover:bg-bg-hover ${
                t.symbol === selected ? "bg-bg-hover" : ""
              }`}
            >
              <span className="w-12 truncate">{t.symbol.replace("USDT", "")}</span>
              <span className="text-right tabular-nums text-muted">
                {formatPrice(t.last_price)}
              </span>
              <span
                className={`w-14 text-right tabular-nums ${
                  t.change_pct >= 0 ? "text-up" : "text-down"
                }`}
              >
                {t.change_pct >= 0 ? "+" : ""}
                {t.change_pct.toFixed(1)}%
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
