"use client";

// 🧲 Smart S/R zones — clustered swing extremes with strength scores.
import { useEffect, useState } from "react";
import { formatPrice } from "./Watchlist";

interface Zone {
  price_lo: number;
  price_hi: number;
  mid: number;
  side: "support" | "resistance";
  touches: number;
  score: number;
  last_touch_bars_ago: number;
  volume_share_pct: number;
  rejections: number;
}

interface Data {
  last_price: number;
  zones: Zone[];
}

function scoreLabel(s: number): string {
  if (s >= 70) return "RẤT MẠNH";
  if (s >= 50) return "MẠNH";
  return "VỪA";
}

export default function SmartZones({
  symbol,
  interval,
}: {
  symbol: string;
  interval: string;
}) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(
          `/api/analysis/zones?symbol=${symbol}&interval=${interval}`
        ).then((x) => x.json());
        if (!cancelled) setData(r);
      } catch {
        /* keep old */
      }
    }
    load();
    const id = setInterval(load, 120000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, interval]);

  if (!data || data.zones.length === 0) return null;

  const maxScore = Math.max(...data.zones.map((z) => z.score), 1);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto text-xs">
      <p className="border-b border-bg-border px-3 py-1.5 text-[10px] leading-snug text-muted">
        🧲 Vùng S/R tự động từ cluster swing points — chấm điểm theo số lần
        chạm + volume + độ mới + wick rejections.
      </p>

      {/* Current price marker */}
      <div className="flex items-center gap-2 border-b border-bg-border px-3 py-1 font-mono text-[11px]">
        <span className="text-accent">▶</span>
        <b className="tabular-nums">{formatPrice(data.last_price)}</b>
        <span className="ml-auto text-[9px] text-muted">giá hiện tại</span>
      </div>

      {data.zones.map((z, i) => (
        <div
          key={i}
          title={`Vùng ${formatPrice(z.price_lo)}–${formatPrice(z.price_hi)} · ${z.touches} lần chạm · ${z.volume_share_pct}% tổng volume · chạm cuối ${z.last_touch_bars_ago} nến trước`}
          className="flex items-center gap-2 px-3 py-1 hover:bg-bg-hover"
        >
          <span
            className={`w-16 shrink-0 font-semibold ${
              z.side === "support" ? "text-up" : "text-down"
            }`}
          >
            {z.side === "support" ? "SUP" : "RES"}
          </span>
          <span className="w-20 shrink-0 text-right font-mono tabular-nums">
            {formatPrice(z.mid)}
          </span>
          {/* Strength bar */}
          <div className="relative h-2 flex-1 rounded bg-bg-hover/40">
            <div
              className="absolute inset-y-0 left-0 rounded"
              style={{
                width: `${(z.score / maxScore) * 100}%`,
                background:
                  z.side === "support"
                    ? `rgba(14,203,129,${0.35 + (z.score / maxScore) * 0.55})`
                    : `rgba(246,70,93,${0.35 + (z.score / maxScore) * 0.55})`,
              }}
            />
          </div>
          <span
            className={`w-14 shrink-0 text-right text-[9px] font-semibold ${
              z.score >= 70 ? "text-accent" : "text-muted"
            }`}
          >
            {scoreLabel(z.score)}
          </span>
          <span className="w-8 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted">
            ×{z.touches}
          </span>
        </div>
      ))}

      <p className="border-t border-bg-border px-3 py-1 text-[9px] leading-snug text-muted">
        Vùng RẤT MẠNH thường giữ giá nhiều lần — entry limit tại đó hoặc SL đặt
        sau nó. Giá xuyên qua vùng mạnh = tín hiệu breakout thật.
      </p>
    </div>
  );
}