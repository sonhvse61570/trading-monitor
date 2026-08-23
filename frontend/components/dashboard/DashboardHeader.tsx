"use client";

// Dashboard header — brand, nav links, live badges.
import Link from "next/link";
import { formatPrice } from "@/components/Watchlist";
import ConnectionStatus from "@/components/ConnectionStatus";
import FearGreedBadge from "@/components/FearGreedBadge";
import CandleCountdown from "@/components/CandleCountdown";
import VolatilityBadge from "@/components/VolatilityBadge";
import type { Candle, Ticker } from "@/lib/types";

const NAV = [
  { href: "/screener", icon: "🔍", label: "Screener" },
  { href: "/analytics", icon: "📊", label: "Analytics" },
  { href: "/backtest", icon: "🧪", label: "Backtest" },
  { href: "/journal", icon: "📓", label: "Journal" },
  { href: "/bot", icon: "🤖", label: "Bot", accent: true },
  { href: "/intel", icon: "🌐", label: "Intel" },
];

export default function DashboardHeader({
  selectedTicker,
  candles,
  interval,
}: {
  selectedTicker: Ticker | null;
  candles: Candle[];
  interval: string;
}) {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-bg-border bg-bg-panel px-3 py-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <h1 className="truncate text-sm font-bold tracking-wide">
          📈
          <span className="ml-1 hidden sm:inline">TRADING MONITOR</span>
          <span className="ml-1 hidden rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent md:inline">
            Binance USD-M Futures
          </span>
        </h1>
        {NAV.map(({ href, icon, label, accent }) => (
          <Link
            key={href}
            href={href}
            className={
              accent
                ? "rounded border border-accent/60 bg-accent/10 px-2 py-1 text-xs font-semibold text-accent hover:bg-accent/20"
                : "rounded border border-bg-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
            }
          >
            {icon}
            <span className="ml-1 hidden sm:inline">{label}</span>
          </Link>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <CandleCountdown candles={candles} interval={interval} />
        <VolatilityBadge candles={candles} />
        <FearGreedBadge />
        <ConnectionStatus />
        {selectedTicker && (
          <div className="hidden items-baseline gap-3 font-mono text-sm sm:flex">
            <span className="text-lg font-semibold tabular-nums">
              {formatPrice(selectedTicker.last_price)}
            </span>
            <span
              className={
                selectedTicker.change_pct >= 0 ? "text-up" : "text-down"
              }
            >
              {selectedTicker.change_pct >= 0 ? "+" : ""}
              {selectedTicker.change_pct.toFixed(2)}%
            </span>
          </div>
        )}
      </div>
    </header>
  );
}