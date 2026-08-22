"use client";

// Strategy backtesting UI.
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface Result {
  strategy: string;
  symbol: string;
  interval: string;
  candles_tested: number;
  total_trades: number;
  total_pnl: number;
  win_rate: number | null;
  trades: {
    side: string;
    entry: number;
    exit: number;
    pnl: number;
    entry_time: number;
    exit_time: number;
  }[];
}

const STRATEGIES = [
  { name: "ma_cross", label: "MA Cross (EMA9/21)" },
  { name: "rsi_mean_reversion", label: "RSI Mean Reversion" },
];
const INTERVALS = ["15m", "1h", "4h", "1d"];
const VENUES = ["binance", "okx", "bybit"];

export default function BacktestPage() {
  const [strategy, setStrategy] = useState("ma_cross");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setIntervalState] = useState("1h");
  const [limit, setLimit] = useState(500);
  const [venue, setVenue] = useState("binance");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.backtest({ strategy, symbol, interval, limit, venue });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold">🧪 Backtest chiến lược</h1>
        <div className="flex gap-2">
          <Link href="/" className="rounded bg-bg-hover px-3 py-1.5 text-sm hover:bg-bg-border">
            ← Dashboard
          </Link>
          <Link href="/analytics" className="rounded bg-bg-hover px-3 py-1.5 text-sm hover:bg-bg-border">
            📊 Analytics
          </Link>
        </div>
      </header>

      {/* Form */}
      <section className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-bg-border bg-bg-panel p-4 md:grid-cols-5">
        <Field label="Strategy">
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)} className={inputCls}>
            {STRATEGIES.map((s) => (
              <option key={s.name} value={s.name}>{s.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Symbol">
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className={inputCls} />
        </Field>
        <Field label="Timeframe">
          <select value={interval} onChange={(e) => setIntervalState(e.target.value)} className={inputCls}>
            {INTERVALS.map((iv) => <option key={iv}>{iv}</option>)}
          </select>
        </Field>
        <Field label="Số nến">
          <input type="number" min={100} max={1000} step={100} value={limit}
                 onChange={(e) => setLimit(Number(e.target.value))} className={inputCls} />
        </Field>
        <Field label="Sàn">
          <select value={venue} onChange={(e) => setVenue(e.target.value)} className={inputCls}>
            {VENUES.map((v) => <option key={v}>{v}</option>)}
          </select>
        </Field>
      </section>

      <button
        onClick={run}
        disabled={busy}
        className="mb-6 w-full rounded bg-accent py-2 font-semibold text-black disabled:opacity-50"
      >
        {busy ? "Đang chạy backtest..." : "▶ Chạy backtest"}
      </button>

      {error && <p className="mb-4 rounded bg-down/10 p-3 text-sm text-down">{error}</p>}

      {/* Results */}
      {result && (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card label="Nến đã test" value={String(result.candles_tested)} />
            <Card label="Tổng lệnh" value={String(result.total_trades)} />
            <Card
              label="Win rate"
              value={result.win_rate != null ? `${result.win_rate}%` : "—"}
              accent={result.win_rate != null && result.win_rate >= 50 ? "up" : "down"}
            />
            <Card
              label="Tổng PnL (per unit)"
              value={`${result.total_pnl >= 0 ? "+" : ""}${result.total_pnl.toFixed(4)}`}
              accent={result.total_pnl >= 0 ? "up" : "down"}
            />
          </section>

          <section className="overflow-hidden rounded-lg border border-bg-border">
            <h2 className="border-b border-bg-border bg-bg-panel px-4 py-2 text-sm font-semibold">
              Chi tiết giao dịch mô phỏng
            </h2>
            <table className="w-full text-left text-xs">
              <thead className="bg-bg-panel text-muted">
                <tr>
                  <th className="px-3 py-1.5">Side</th>
                  <th className="px-3 py-1.5">Entry</th>
                  <th className="px-3 py-1.5">Exit</th>
                  <th className="px-3 py-1.5">PnL</th>
                  <th className="px-3 py-1.5">Vào lúc</th>
                  <th className="px-3 py-1.5">Ra lúc</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {result.trades.map((t, i) => (
                  <tr key={i} className="border-t border-bg-border/50 hover:bg-bg-hover">
                    <td className={`px-3 py-1.5 ${t.side === "LONG" ? "text-up" : "text-down"}`}>{t.side}</td>
                    <td className="px-3 py-1.5 tabular-nums">{t.entry}</td>
                    <td className="px-3 py-1.5 tabular-nums">{t.exit}</td>
                    <td className={`px-3 py-1.5 tabular-nums ${t.pnl >= 0 ? "text-up" : "text-down"}`}>
                      {t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(4)}
                    </td>
                    <td className="px-3 py-1.5">{new Date(t.entry_time * 1000).toLocaleString("vi-VN")}</td>
                    <td className="px-3 py-1.5">{new Date(t.exit_time * 1000).toLocaleString("vi-VN")}</td>
                  </tr>
                ))}
                {result.trades.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">Không có giao dịch nào trong khoảng dữ liệu.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <p className="mt-3 text-xs text-muted">
            ⚠️ Kết quả chưa tính phí giao dịch và slippage — coi như kết quả tối ưu.
          </p>
        </>
      )}
    </main>
  );
}

const inputCls =
  "w-full rounded border border-bg-border bg-bg-hover px-2 py-1.5 text-sm outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
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