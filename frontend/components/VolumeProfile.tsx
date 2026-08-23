"use client";

// 📊 Volume Profile — horizontal volume-by-price bars with POC + VA.
import { useEffect, useState } from "react";
import { formatPrice } from "./Watchlist";

interface Row {
  price: number;
  volume: number;
  in_va: boolean;
  is_poc: boolean;
}

interface Data {
  poc: number | null;
  value_area: [number, number] | null;
  rows: Row[];
}

export default function VolumeProfile({
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
          `/api/analysis/volume-profile?symbol=${symbol}&interval=${interval}`
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
  }, [symbol, interval]);

  if (!data || data.rows.length === 0) return null;

  const maxVol = Math.max(...data.rows.map((r) => r.volume), 1);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto text-xs">
      <p className="border-b border-bg-border px-3 py-1.5 text-[10px] leading-snug text-muted">
        📊 Phân bố volume theo giá — <b>POC</b> là mức được giao dịch nhiều
        nhất (hút giá quay lại); Value Area chứa 70% volume.
      </p>

      {data.poc != null && data.value_area && (
        <div className="grid grid-cols-2 gap-2 border-b border-bg-border px-3 py-1.5 font-mono">
          <div>
            <div className="text-[9px] uppercase text-muted">POC</div>
            <div className="font-semibold text-accent tabular-nums">
              {formatPrice(data.poc)}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase text-muted">Value Area</div>
            <div className="tabular-nums">
              {formatPrice(data.value_area[0])} –{" "}
              {formatPrice(data.value_area[1])}
            </div>
          </div>
        </div>
      )}

      {/* Horizontal bars, high price on top */}
      <div className="min-h-0 flex-1 space-y-px p-2">
        {[...data.rows].reverse().map((row) => (
          <div key={row.price} className="flex items-center gap-2">
            <span
              className={`w-16 shrink-0 text-right font-mono text-[9px] tabular-nums ${
                row.is_poc ? "font-bold text-accent" : "text-muted"
              }`}
            >
              {formatPrice(row.price)}
            </span>
            <div className="relative h-2 flex-1 rounded-sm bg-bg-hover/30">
              <div
                className={`absolute inset-y-0 left-0 rounded-sm ${
                  row.is_poc ? "bg-accent" : row.in_va ? "bg-up/50" : "bg-bg-hover"
                }`}
                style={{ width: `${(row.volume / maxVol) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="border-t border-bg-border px-3 py-1 text-[9px] leading-snug text-muted">
        Giá ngoài VA thường nhanh quay vào trong; breakout từ VA + volume =
        trend mới.
      </p>
    </div>
  );
}