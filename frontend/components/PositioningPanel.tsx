"use client";

// 📊 Derivatives positioning — OI trend + long/short ratios.
import { useEffect, useState } from "react";

interface LS {
  ratio: number;
  long_pct: number;
  short_pct: number;
}

interface Data {
  open_interest: number | null;
  oi_change_24h_pct: number | null;
  oi_series: { ts: number; oi: number }[];
  ls_global: LS | null;
  ls_top_traders: LS | null;
}

export default function PositioningPanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(`/api/analysis/positioning?symbol=${symbol}`).then(
          (x) => x.json()
        );
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

  if (!data) return null;

  const oi = data.open_interest;
  const chg = data.oi_change_24h_pct;

  // Interpretation helper
  function lsVerdict(ls: LS | null, label: string) {
    if (!ls) return null;
    const skew = ls.ratio > 1.5 ? "long-heavy" : ls.ratio < 0.67 ? "short-heavy" : "balanced";
    return (
      <div className="flex items-center justify-between py-1">
        <span className="text-muted">{label}</span>
        <span className="flex items-center gap-2 font-mono tabular-nums">
          <span className="text-up">{ls.long_pct.toFixed(1)}%</span>
          {/* Split bar */}
          <span className="flex h-1.5 w-20 overflow-hidden rounded-full">
            <span className="bg-up" style={{ width: `${ls.long_pct}%` }} />
            <span className="bg-down" style={{ width: `${ls.short_pct}%` }} />
          </span>
          <span className="text-down">{ls.short_pct.toFixed(1)}%</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto text-xs">
      <div className="border-b border-bg-border px-3 py-1.5 text-[10px] leading-snug text-muted">
        📊 Vị thế phái sinh — OI tăng + giá tăng = xu hướng khỏe; OI giảm khi
        giá tăng = short squeeze cạn nhiên liệu.
      </div>

      {/* Open interest */}
      {oi != null && (
        <div className="border-b border-bg-border px-3 py-2">
          <div className="flex items-baseline justify-between">
            <span className="text-muted">Open Interest</span>
            <span className="font-mono text-sm font-semibold tabular-nums">
              {oi.toLocaleString("vi-VN", { maximumFractionDigits: 0 })}
              <span className="ml-1 text-[10px] text-muted">{symbol.replace("USDT", "")}</span>
            </span>
          </div>
          {chg != null && (
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-muted">24h</span>
              <span
                className={`font-mono tabular-nums ${
                  chg >= 0 ? "text-up" : "text-down"
                }`}
              >
                {chg >= 0 ? "+" : ""}
                {chg}%
              </span>
            </div>
          )}
          {/* Mini OI sparkline */}
          {data.oi_series.length > 2 && (
            <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="mt-1 h-8 w-full">
              {(() => {
                const pts = data.oi_series.map((p) => p.oi);
                const mn = Math.min(...pts);
                const mx = Math.max(...pts);
                const span = mx - mn || 1;
                const path = pts
                  .map(
                    (v, i) =>
                      `${i === 0 ? "M" : "L"} ${(i / (pts.length - 1)) * 100},${
                        18 - ((v - mn) / span) * 16
                      }`
                  )
                  .join(" ");
                return (
                  <path d={path} fill="none" stroke="#f0b90b" strokeWidth="1" />
                );
              })()}
            </svg>
          )}
        </div>
      )}

      {/* Long/Short ratios */}
      <div className="px-3 py-2">
        {lsVerdict(data.ls_top_traders, "🐋 Top traders")}
        {lsVerdict(data.ls_global, "👥 Toàn sàn")}
        {(data.ls_top_traders || data.ls_global) && (
          <p className="mt-1 text-[10px] leading-snug text-muted">
            {
              "Top traders lệch hẳn một phía (ratio > 1.5 hoặc < 0.67) thường là dấu hiệu smart money đã đặt cược — theo hoặc cảnh giác squeeze."
            }
          </p>
        )}
      </div>
    </div>
  );
}