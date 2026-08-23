"use client";

// Classic pivot points with distance-to-current-price.
import { useEffect, useState } from "react";
import { formatPrice } from "./Watchlist";

interface Pivots {
  p: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export default function PivotLevels({
  symbol,
  currentPrice,
}: {
  symbol: string;
  currentPrice: number | null;
}) {
  const [pivots, setPivots] = useState<Pivots | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(`/api/analysis/pivots?symbol=${symbol}`).then(
          (x) => x.json()
        );
        if (!cancelled && r.p) setPivots(r);
      } catch {
        /* keep old */
      }
    }
    load();
    const id = setInterval(load, 300000); // daily levels, refresh 5m
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  if (!pivots) return null;

  const rows: [string, number][] = [
    ["R3", pivots.r3],
    ["R2", pivots.r2],
    ["R1", pivots.r1],
    ["P", pivots.p],
    ["S1", pivots.s1],
    ["S2", pivots.s2],
    ["S3", pivots.s3],
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="border-b border-bg-border px-3 py-1.5 text-[10px] leading-snug text-muted">
        🎯 Pivot points từ nến ngày hôm trước — mức S/R kinh điển
      </div>
      <table className="w-full font-mono text-xs">
        <tbody>
          {rows.map(([label, price]) => {
            const dist =
              currentPrice != null
                ? ((price - currentPrice) / currentPrice) * 100
                : null;
            const isRes = price > (currentPrice ?? 0);
            return (
              <tr key={label} className="border-b border-bg-border/40 hover:bg-bg-hover">
                <td
                  className={`px-3 py-1 font-semibold ${
                    label === "P" ? "text-accent" : isRes ? "text-down" : "text-up"
                  }`}
                >
                  {label}
                </td>
                <td className="py-1 tabular-nums">{formatPrice(price)}</td>
                <td className="px-3 py-1 text-right text-[10px] tabular-nums text-muted">
                  {dist != null ? `${dist >= 0 ? "+" : ""}${dist.toFixed(2)}%` : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}