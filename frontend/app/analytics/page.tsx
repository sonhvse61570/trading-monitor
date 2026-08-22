"use client";

// Performance analytics page.
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { PerformanceMetrics } from "@/lib/types";

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .performance()
      .then(setMetrics)
      .catch((e) => setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu"));
  }, []);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold">📈 Hiệu suất giao dịch</h1>
        <Link href="/" className="rounded bg-bg-hover px-3 py-1.5 text-sm hover:bg-bg-border">
          ← Dashboard
        </Link>
      </header>

      {error && (
        <p className="rounded bg-down/10 p-4 text-sm text-down">
          {error} — cần cấu hình BINANCE_API_KEY trong backend/.env để tính hiệu suất.
        </p>
      )}

      {!metrics && !error && <p className="text-sm text-muted">Đang tải...</p>}

      {metrics && (
        <>
          <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card label="Tổng lệnh khớp" value={String(metrics.total_trades)} />
            <Card
              label="Win rate"
              value={metrics.win_rate != null ? `${metrics.win_rate}%` : "—"}
              accent={metrics.win_rate != null && metrics.win_rate >= 50 ? "up" : "down"}
            />
            <Card
              label="Tổng PnL (FIFO)"
              value={`${metrics.total_pnl >= 0 ? "+" : ""}${metrics.total_pnl.toFixed(2)}`}
              accent={metrics.total_pnl >= 0 ? "up" : "down"}
            />
            <Card
              label="Profit factor"
              value={metrics.profit_factor != null ? String(metrics.profit_factor) : "—"}
            />
            <Card label="Thắng / Thua" value={`${metrics.wins} / ${metrics.losses}`} />
            <Card
              label="Lãi TB / Lỗ TB"
              value={`${metrics.avg_win?.toFixed(2) ?? "—"} / ${metrics.avg_loss?.toFixed(2) ?? "—"}`}
            />
            <Card
              label="Max drawdown"
              value={`${metrics.max_drawdown.toFixed(2)} (${metrics.max_drawdown_pct}%)`}
              accent="down"
            />
            <Card
              label="Expectancy/lệnh"
              value={metrics.expectancy != null ? metrics.expectancy.toFixed(4) : "—"}
            />
          </section>

          {/* Equity curve */}
          <section className="mb-8 rounded-lg border border-bg-border bg-bg-panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Equity Curve (cumulative PnL)</h2>
            <EquityCurve points={metrics.equity_curve} />
          </section>

          {/* Recent round trips */}
          <section className="overflow-hidden rounded-lg border border-bg-border">
            <h2 className="border-b border-bg-border bg-bg-panel px-4 py-2 text-sm font-semibold">
              Giao dịch gần nhất (BUY→SELL FIFO)
            </h2>
            <table className="w-full text-left text-xs">
              <thead className="bg-bg-panel text-muted">
                <tr>
                  <th className="px-3 py-1.5">Thời gian</th>
                  <th className="px-3 py-1.5">Symbol</th>
                  <th className="px-3 py-1.5">Entry</th>
                  <th className="px-3 py-1.5">Exit</th>
                  <th className="px-3 py-1.5">Qty</th>
                  <th className="px-3 py-1.5">PnL</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {metrics.recent_trades.map((t, i) => (
                  <tr key={i} className="border-t border-bg-border/50 hover:bg-bg-hover">
                    <td className="px-3 py-1.5">{new Date(t.time).toLocaleString("vi-VN")}</td>
                    <td className="px-3 py-1.5 font-semibold">{t.symbol.replace("USDT", "")}</td>
                    <td className="px-3 py-1.5 tabular-nums">{t.entry}</td>
                    <td className="px-3 py-1.5 tabular-nums">{t.exit}</td>
                    <td className="px-3 py-1.5 tabular-nums">{t.qty}</td>
                    <td className={`px-3 py-1.5 tabular-nums ${t.pnl >= 0 ? "text-up" : "text-down"}`}>
                      {t.pnl >= 0 ? "+" : ""}
                      {t.pnl.toFixed(4)}
                    </td>
                  </tr>
                ))}
                {metrics.recent_trades.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted">
                      Chưa có giao dịch khớp nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}

function Card({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "up" | "down";
}) {
  return (
    <div className="rounded-lg border border-bg-border bg-bg-panel p-3">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
          accent === "up" ? "text-up" : accent === "down" ? "text-down" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function EquityCurve({ points }: { points: { i: number; cum_pnl: number }[] }) {
  if (points.length < 2) {
    return <p className="text-sm text-muted">Cần ít nhất 2 giao dịch để vẽ equity curve.</p>;
  }
  const w = 800;
  const h = 180;
  const values = points.map((p) => p.cum_pnl);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const coords = points.map((p, idx) => {
    const x = (idx / (points.length - 1)) * w;
    const y = h - ((p.cum_pnl - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lastPositive = values[values.length - 1] >= 0;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
      <line x1="0" y1={h - ((0 - min) / range) * h} x2={w} y2={h - ((0 - min) / range) * h} stroke="#232a35" strokeDasharray="4 4" />
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={lastPositive ? "#0ecb81" : "#f6465d"}
        strokeWidth="2"
      />
    </svg>
  );
}