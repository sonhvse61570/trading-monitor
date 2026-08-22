"use client";

// Countdown to current candle close — helps time entries.
import { useEffect, useState } from "react";
import type { Candle } from "@/lib/types";

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

export default function CandleCountdown({
  candles,
  interval,
}: {
  candles: Candle[];
  interval: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (candles.length === 0) return null;

  const duration = INTERVAL_MS[interval];
  if (!duration) return null;

  const lastOpenMs = candles[candles.length - 1].time * 1000;
  const remaining = Math.max(0, lastOpenMs + duration - now);
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);

  const urgent = remaining < duration * 0.1; // last 10%

  return (
    <span
      className={`rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
        urgent ? "bg-down/20 text-down" : "bg-bg-hover text-muted"
      }`}
      title={`Nến ${interval} đóng sau ${mm}:${String(ss).padStart(2, "0")}`}
    >
      ⏳ {mm}:{String(ss).padStart(2, "0")}
    </span>
  );
}