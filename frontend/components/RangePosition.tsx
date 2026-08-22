"use client";

// Where is price within its 24h range? Horizontal gauge.
import type { Ticker } from "@/lib/types";

export default function RangePosition({ ticker }: { ticker: Ticker }) {
  const { low_24h, high_24h, last_price } = ticker;
  if (!high_24h || high_24h <= low_24h) return null;

  const pct = Math.min(
    100,
    Math.max(0, ((last_price - low_24h) / (high_24h - low_24h)) * 100)
  );

  return (
    <div
      className="w-full px-3 pb-1.5 pt-0.5"
      title={`Range 24h: ${low_24h.toLocaleString("vi-VN")} → ${high_24h.toLocaleString("vi-VN")}`}
    >
      <div className="relative h-1 rounded-full bg-bg-hover">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-down/60 via-accent/50 to-up/70"
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-bg-border bg-white shadow"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-[9px] text-muted">
        <span>L {low_24h.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}</span>
        <span>{pct.toFixed(0)}% range</span>
        <span>H {high_24h.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}</span>
      </div>
    </div>
  );
}