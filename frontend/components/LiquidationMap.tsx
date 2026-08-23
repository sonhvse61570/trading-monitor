"use client";

// 💥 Liquidation clusters — horizontal bars around current price.
import { useEffect, useState } from "react";
import { formatPrice } from "./Watchlist";

interface Bucket {
  price_lo: number;
  price_hi: number;
  long_usd: number;
  short_usd: number;
}

interface Data {
  last_price: number;
  buckets: Bucket[];
  disclaimer: string;
}

export default function LiquidationMap({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(
          `/api/analysis/liquidations?symbol=${symbol}`
        ).then((x) => x.json());
        if (!cancelled) setData(r);
      } catch {
        /* keep old */
      }
    }
    load();
    const id = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  if (!data || data.buckets.length === 0) return null;

  const maxUsd = Math.max(
    ...data.buckets.map((b) => b.long_usd + b.short_usd),
    1
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto text-xs">
      <p className="border-b border-bg-border px-3 py-1.5 text-[10px] leading-snug text-muted">
        💥 Vùng thanh lý ước tính — khối lượng lớn bị thanh lý nếu giá chạm.
        Bars dài = magnet giá mạnh khi thị trường biến động.
      </p>

      {/* Current price marker */}
      <div className="flex items-center gap-2 border-b border-bg-border px-3 py-1 font-mono">
        <span className="text-accent">▶ Giá hiện tại</span>
        <b className="tabular-nums">{formatPrice(data.last_price)}</b>
      </div>

      {data.buckets.map((b, i) => {
        const mid = (b.price_lo + b.price_hi) / 2;
        const below = mid < data.last_price;
        const total = b.long_usd + b.short_usd;
        return (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-0.5 hover:bg-bg-hover"
            title={`$${(total / 1000).toFixed(0)}k · long $${(b.long_usd / 1000).toFixed(0)}k / short $${(b.short_usd / 1000).toFixed(0)}k`}
          >
            <span className="w-20 shrink-0 text-right font-mono tabular-nums text-muted">
              {formatPrice(mid)}
            </span>
            <div className="relative h-2 flex-1 rounded bg-bg-hover/40">
              <div
                className="absolute inset-y-0 left-0 rounded"
                style={{
                  width: `${(total / maxUsd) * 100}%`,
                  background:
                    b.long_usd >= b.short_usd
                      ? "rgba(14,203,129,0.7)"
                      : "rgba(246,70,93,0.7)",
                }}
              />
            </div>
            <span className="w-14 shrink-0 text-right font-mono tabular-nums text-muted">
              ${(total / 1000).toFixed(0)}k
            </span>
          </div>
        );
      })}

      <p className="px-3 py-1.5 text-[9px] leading-snug text-muted">
        ⚠️ {data.disclaimer}
      </p>
    </div>
  );
}