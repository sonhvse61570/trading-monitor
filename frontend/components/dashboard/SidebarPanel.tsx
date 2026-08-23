"use client";

// Sidebar — tabbed market data panels + analysis stack + mini equity.
import Watchlist from "@/components/Watchlist";
import ScannerPanel from "@/components/ScannerPanel";
import MoversPanel from "@/components/MoversPanel";
import WhaleHeatmap from "@/components/WhaleHeatmap";
import SmartMoneyPanel from "@/components/SmartMoneyPanel";
import PositioningPanel from "@/components/PositioningPanel";
import PivotLevels from "@/components/PivotLevels";
import AlertsPanel from "@/components/AlertsPanel";
import FundingPanel from "@/components/FundingPanel";
import LiquidationMap from "@/components/LiquidationMap";
import CorrelationMatrix from "@/components/CorrelationMatrix";
import ConfluenceGauge from "@/components/ConfluenceGauge";
import MTFMatrix from "@/components/MTFMatrix";
import TradeSetupCard from "@/components/TradeSetupCard";
import MiniEquity from "@/components/MiniEquity";
import type { Ticker } from "@/lib/types";

export type SidebarTab =
  | "watchlist"
  | "scanner"
  | "movers"
  | "heatmap"
  | "whale"
  | "positioning"
  | "liquidations"
  | "correlation"
  | "pivots"
  | "alerts"
  | "funding";

const TABS: [SidebarTab, string, string | undefined][] = [
  ["watchlist", "Watch", undefined],
  ["scanner", "Scan", undefined],
  ["movers", "Movers", undefined],
  ["heatmap", "🔥", "Whale footprint heatmap"],
  ["whale", "🦈", "Smart money radar"],
  ["positioning", "📊", "Open interest & L/S ratios"],
  ["liquidations", "💥", "Liquidation clusters (est.)"],
  ["correlation", "🔗", "Correlation matrix"],
  ["pivots", "🎯", "Pivot points"],
  ["alerts", "🔔", "Price alerts"],
  ["funding", "💸", "Funding rates"],
];

export default function SidebarPanel({
  tab,
  onTabChange,
  tickers,
  symbol,
  currentPrice,
  onSelect,
}: {
  tab: SidebarTab;
  onTabChange: (t: SidebarTab) => void;
  tickers: Ticker[];
  symbol: string;
  currentPrice: number | null;
  onSelect: (s: string) => void;
}) {
  return (
    <section className="row-span-2 grid min-h-0 grid-rows-[auto_1fr_auto_auto] bg-bg-panel">
      {/* Tabs */}
      <div className="grid grid-cols-3 border-b border-bg-border">
        {TABS.map(([id, label, title]) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            title={title}
            className={`py-2 text-xs ${
              tab === id
                ? "bg-bg-hover font-semibold text-white"
                : "text-muted hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <div className="min-h-0">
        {tab === "watchlist" && (
          <Watchlist tickers={tickers} selected={symbol} onSelect={onSelect} />
        )}
        {tab === "scanner" && <ScannerPanel onSelect={onSelect} />}
        {tab === "movers" && (
          <MoversPanel tickers={tickers} selected={symbol} onSelect={onSelect} />
        )}
        {tab === "heatmap" && <WhaleHeatmap symbol={symbol} />}
        {tab === "whale" && <SmartMoneyPanel symbol={symbol} />}
        {tab === "positioning" && <PositioningPanel symbol={symbol} />}
        {tab === "liquidations" && <LiquidationMap symbol={symbol} />}
        {tab === "correlation" && <CorrelationMatrix />}
        {tab === "pivots" && (
          <PivotLevels symbol={symbol} currentPrice={currentPrice} />
        )}
        {tab === "alerts" && <AlertsPanel symbol={symbol} />}
        {tab === "funding" && <FundingPanel onSelect={onSelect} />}
      </div>

      {/* Analysis stack */}
      <div className="grid shrink-0 grid-rows-[auto_auto_auto] border-t border-bg-border">
        <ConfluenceGauge symbol={symbol} />
        <MTFMatrix symbol={symbol} />
        <div className="max-h-[190px] overflow-y-auto">
          <TradeSetupCard symbol={symbol} />
        </div>
      </div>

      <MiniEquity />
    </section>
  );
}