"use client";

// 🦈 Smart Money Radar — whale prints, CVD trend, order-book walls.
import { useEffect, useState } from "react";

interface Whale {
  price: number;
  qty: number;
  notional: number;
  side: "BUY" | "SELL";
  time: number;
}

interface Wall {
  side: string;
  price: number;
  qty: number;
  notional: number;
  z: number;
}

interface Data {
  whales: Whale[];
  whale_net_flow: number;
  cvd_series: { ts: number; cvd: number }[];
  cvd_trend: string | null;
  walls: Wall[];
}

const THRESHOLDS = [25_000, 50_000, 100_000, 250_000];

export default function SmartMoneyPanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [threshold, setThreshold] = useState(50_000);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(
          `/api/intel/smart-money?symbol=${symbol}&min_notional=${threshold}`
        ).then((x) => x.json());
        if (!cancelled) setData(r);
      } catch {
        /* keep old */
      }
    }
    load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, threshold]);

  if (!data) return null;

  const net = data.whale_net_flow;
  const maxCvd = Math.max(...data.cvd_series.map((c) => Math.abs(c.cvd)), 1);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto text-xs">
      {/* Threshold selector */}
      <div className="flex items-center gap-1 border-b border-bg-border px-2 py-1.5">
        <span className="text-muted">🦈 Cá mập ≥</span>
        {THRESHOLDS.map((t) => (
          <button
            key={t}
            onClick={() => setThreshold(t)}
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
              threshold === t
                ? "bg-accent/20 text-accent"
                : "text-muted hover:bg-bg-hover"
            }`}
          >
            ${t / 1000}k
          </button>
        ))}
        {/* Net flow */}
        <span
          className={`ml-auto rounded px-1.5 py-0.5 font-mono tabular-nums ${
            net > 0 ? "bg-up/15 text-up" : net < 0 ? "bg-down/15 text-down" : ""
          }`}
          title="Tổng notional whale BUY trừ SELL trong các lệnh gần nhất"
        >
          Net {net >= 0 ? "+" : ""}
          {(net / 1000).toFixed(0)}k$
        </span>
      </div>

      {/* CVD sparkline */}
      {data.cvd_series.length > 2 && (
        <div className="border-b border-bg-border px-2 py-1.5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-muted">CVD (24×5m)</span>
            <span
              className={
                data.cvd_trend === "accumulation"
                  ? "font-semibold text-up"
                  : "font-semibold text-down"
              }
            >
              {data.cvd_trend === "accumulation"
                ? "📈 ACCUMULATION"
                : "📉 DISTRIBUTION"}
            </span>
          </div>
          <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-8 w-full">
            {(() => {
              const pts = data.cvd_series;
              const path = pts
                .map(
                  (p, i) =>
                    `${i === 0 ? "M" : "L"} ${(i / (pts.length - 1)) * 100},${
                      12 - (p.cvd / maxCvd) * 10
                    }`
                )
                .join(" ");
              return (
                <>
                  <line x1="0" y1="12" x2="100" y2="12" stroke="#232a35" strokeWidth="0.4" />
                  <path d={path} fill="none" stroke={pts[pts.length - 1].cvd >= 0 ? "#0ecb81" : "#f6465d"} strokeWidth="1" />
                </>
              );
            })()}
          </svg>
        </div>
      )}

      {/* Walls */}
      {data.walls.length > 0 && (
        <div className="border-b border-bg-border px-2 py-1.5">
          <div className="mb-1 text-muted">🧱 Tường lệnh (z-score ≥ 4σ)</div>
          {data.walls.slice(0, 4).map((w, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5 font-mono">
              <span
                className={`w-10 ${
                  w.side === "bid" ? "text-up" : "text-down"
                }`}
              >
                {w.side === "bid" ? "BID" : "ASK"}
              </span>
              <span className="tabular-nums">
                {w.price.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}
              </span>
              <span className="ml-auto tabular-nums text-muted">
                ${(w.notional / 1e6).toFixed(2)}M · {w.z}σ
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Whale prints */}
      <div className="min-h-0 flex-1">
        <div className="px-2 py-1 text-muted">Lệnh khối lượng lớn</div>
        {data.whales.map((w, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-2 py-0.5 font-mono hover:bg-bg-hover"
          >
            <span
              className={`w-9 ${w.side === "BUY" ? "text-up" : "text-down"}`}
            >
              {w.side}
            </span>
            <span className="tabular-nums">
              {w.price.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}
            </span>
            <span className="ml-auto tabular-nums text-muted">
              ${(w.notional / 1000).toFixed(0)}k
            </span>
            <span className="w-14 text-right text-[10px] text-muted">
              {new Date(w.time).toLocaleTimeString("vi-VN")}
            </span>
          </div>
        ))}
        {data.whales.length === 0 && (
          <p className="px-2 py-3 text-center text-muted">
            Không có lệnh nào ≥ ngưỡng trong ~500 lệnh gần nhất.
          </p>
        )}
      </div>
    </div>
  );
}