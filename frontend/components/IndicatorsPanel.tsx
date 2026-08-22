"use client";

// Technical indicators strip for the selected symbol — signal badges.
import { useEffect, useState } from "react";

interface Indicators {
  rsi14: number | null;
  ema9: number | null;
  ema21: number | null;
  macd: { macd: number | null; signal: number | null; hist: number | null };
  bollinger: { upper: number | null; mid: number | null; lower: number | null };
  vwap20: number | null;
  last_close: number;
}

type Verdict = "buy" | "sell" | "neutral";

const verdictCls: Record<Verdict, string> = {
  buy: "bg-up/15 text-up",
  sell: "bg-down/15 text-down",
  neutral: "bg-bg-hover text-muted",
};

export default function IndicatorsPanel({
  symbol,
  interval,
}: {
  symbol: string;
  interval: string;
}) {
  const [ind, setInd] = useState<Indicators | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(
          `/api/indicators?symbol=${symbol}&interval=${interval}`
        ).then((x) => x.json());
        if (!cancelled) setInd(r);
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
  }, [symbol, interval]);

  if (!ind || ind.rsi14 == null) return null;

  const close = ind.last_close;

  // Per-indicator verdicts
  const rsiV: Verdict =
    ind.rsi14 <= 30 ? "buy" : ind.rsi14 >= 70 ? "sell" : "neutral";
  const emaV: Verdict =
    ind.ema9 != null && ind.ema21 != null
      ? ind.ema9 > ind.ema21
        ? "buy"
        : "sell"
      : "neutral";
  const macdV: Verdict =
    ind.macd.hist == null
      ? "neutral"
      : ind.macd.hist > 0
        ? "buy"
        : "sell";
  const bbPos =
    ind.bollinger.upper && ind.bollinger.lower
      ? (close - ind.bollinger.lower) / (ind.bollinger.upper - ind.bollinger.lower)
      : 0.5;
  const bbV: Verdict = bbPos >= 0.95 ? "sell" : bbPos <= 0.05 ? "buy" : "neutral";
  const vwapV: Verdict =
    ind.vwap20 == null ? "neutral" : close > ind.vwap20 ? "buy" : "sell";

  // Overall consensus
  const votes = [rsiV, emaV, macdV, bbV, vwapV];
  const buys = votes.filter((v) => v === "buy").length;
  const sells = votes.filter((v) => v === "sell").length;
  const overall: Verdict = buys >= 4 ? "buy" : sells >= 4 ? "sell" : "neutral";

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-bg-border bg-bg-panel px-3 py-1.5 text-xs">
      <span className="text-muted">🧮 Chỉ báo</span>

      <Chip label="Tổng hợp" value={overall} strong />
      <Chip
        label={`RSI ${ind.rsi14.toFixed(0)}`}
        value={rsiV}
        title="≤30 quá bán → mua, ≥70 quá mua → bán"
      />
      <Chip
        label={`EMA9/21 ${emaV === "buy" ? "↑" : "↓"}`}
        value={emaV}
        title="EMA9 so với EMA21"
      />
      <Chip
        label={`MACD ${ind.macd.hist != null ? ind.macd.hist.toFixed(2) : "—"}`}
        value={macdV}
        title="Histogram MACD dương → mua"
      />
      <Chip
        label={`BB ${(bbPos * 100).toFixed(0)}%`}
        value={bbV}
        title="Vị trí giá trong Bollinger band (0% đáy, 100% đỉnh)"
      />
      <Chip
        label={`VWAP ${vwapV === "buy" ? "trên" : "dưới"}`}
        value={vwapV}
        title="Giá so với VWAP20"
      />
    </div>
  );
}

function Chip({
  label,
  value,
  strong,
  title,
}: {
  label: string;
  value: Verdict;
  strong?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`rounded px-1.5 py-0.5 font-mono tabular-nums ${
        verdictCls[value]
      } ${strong ? "font-semibold" : ""}`}
    >
      {label}
      <span className="ml-1">
        {value === "buy" ? "▲" : value === "sell" ? "▼" : "—"}
      </span>
    </span>
  );
}