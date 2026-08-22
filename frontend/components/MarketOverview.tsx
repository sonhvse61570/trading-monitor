"use client";

// Compact top-coins overview strip — price, 24h change, volume.
import { formatPrice } from "./Watchlist";
import type { Ticker } from "@/lib/types";

const FEATURED = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];

export default function MarketOverview({
  tickers,
  selected,
  onSelect,
}: {
  tickers: Ticker[];
  selected: string;
  onSelect: (s: string) => void;
}) {
  const cards = FEATURED.map((sym) =>
    tickers.find((t) => t.symbol === sym)
  ).filter((t): t is Ticker => Boolean(t));

  if (cards.length === 0) return null;

  return (
    <div className="grid shrink-0 grid-cols-3 gap-px bg-bg-border sm:grid-cols-5">
      {cards.map((t) => {
        const isSel = t.symbol === selected;
        return (
          <button
            key={t.symbol}
            onClick={() => onSelect(t.symbol)}
            className={`bg-bg-panel px-3 py-1.5 text-left hover:bg-bg-hover ${
              isSel ? "ring-1 ring-inset ring-accent" : ""
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold">
                {t.symbol.replace("USDT", "")}
                <span className="text-muted">/USDT</span>
              </span>
              <span
                className={`font-mono text-xs tabular-nums ${
                  t.change_pct >= 0 ? "text-up" : "text-down"
                }`}
              >
                {t.change_pct >= 0 ? "+" : ""}
                {t.change_pct.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-sm font-semibold tabular-nums">
                {formatPrice(t.last_price)}
              </span>
              <span className="text-[10px] tabular-nums text-muted">
                ${(t.quote_volume / 1e6).toFixed(0)}M
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}