"use client";

// ATR-based volatility badge — how much does this symbol move?
import { useEffect, useState } from "react";
import type { Candle } from "@/lib/types";

export default function VolatilityBadge({
  candles,
}: {
  candles: Candle[];
}) {
  const [atrPct, setAtrPct] = useState<number | null>(null);

  useEffect(() => {
    if (candles.length < 15) return;
    const trs: number[] = [];
    for (let i = candles.length - 14; i < candles.length; i++) {
      const c = candles[i];
      const prevClose = candles[i - 1].close;
      trs.push(
        Math.max(
          c.high - c.low,
          Math.abs(c.high - prevClose),
          Math.abs(c.low - prevClose)
        )
      );
    }
    const atr = trs.reduce((s, t) => s + t, 0) / trs.length;
    const last = candles[candles.length - 1].close;
    setAtrPct((atr / last) * 100);
  }, [candles]);

  if (atrPct === null) return null;

  // Classify volatility regime.
  const level =
    atrPct >= 1.5 ? "CAO" : atrPct >= 0.5 ? "TB" : "THẤP";
  const cls =
    atrPct >= 1.5
      ? "bg-down/20 text-down"
      : atrPct >= 0.5
        ? "bg-accent/20 text-accent"
        : "bg-up/20 text-up";

  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${cls}`}
      title={`ATR(14) = ${atrPct.toFixed(2)}% giá — biên độ dao động trung bình mỗi nến`}
    >
      📊 Vol {atrPct.toFixed(2)}% · {level}
    </span>
  );
}