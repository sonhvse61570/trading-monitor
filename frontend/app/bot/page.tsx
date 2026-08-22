"use client";

// Bot Management — control autotrader, run optimizer & walk-forward validation.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface AutotradeStatus {
  enabled: boolean;
  last_run: number | null;
  trades_opened: number;
  errors: string[];
}

interface StrategyInfo {
  name: string;
  description: string;
}

interface OptimizeResult {
  combos_tested: number;
  best: {
    params: Record<string, number>;
    trades: number;
    win_rate: number | null;
    pnl_net: number;
    profit_factor: number | null;
    max_drawdown_pct: number;
    score: number;
  } | null;
  top: {
    params: Record<string, number>;
    trades: number;
    win_rate: number | null;
    pnl_net: number;
    profit_factor: number | null;
    score: number;
  }[];
}

interface WalkForwardResult {
  verdict: string;
  avg_in_sample_pf: number | null;
  avg_out_sample_pf: number | null;
  oos_is_ratio: number | null;
  fold_results: Record<string, unknown>[];
}

const VENUES = ["binance", "okx", "bybit"];
const INTERVALS = ["5m", "15m", "1h", "4h"];

const inputCls =
  "rounded border border-bg-border bg-bg-hover px-2 py-1.5 text-sm outline-none focus:border-accent";

export default function BotPage() {
  const [status, setStatus] = useState<AutotradeStatus | null>(null);
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [venue, setVenue] = useState("binance");
  const [interval, setIntervalState] = useState("15m");
  const [riskPct, setRiskPct] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Optimizer state
  const [optStrategy, setOptStrategy] = useState("bollinger_breakout");
  const [optSymbol, setOptSymbol] = useState("BTCUSDT");
  const [optResult, setOptResult] = useState<OptimizeResult | null>(null);

  // Walk-forward state
  const [wfResult, setWfResult] = useState<WalkForwardResult | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, strats] = await Promise.all([
        api.autotradeStatus(),
        api.strategies(),
      ]);
      setStatus(s);
      setStrategies(strats);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  async function toggle(enabled: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      await api.autotradeToggle(enabled, venue, interval, riskPct);
      await load();
      setMessage(enabled ? `Bot đã BẬT trên ${venue} ${interval}, risk ${riskPct}%/lệnh` : "Bot đã TẮT");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Thao tác thất bại");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  async function runOnce() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.autotradeRunOnce();
      setMessage(`Dry-run hoàn tất: ${res.executed.length} lệnh được thực thi`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Dry-run thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function runOptimizer() {
    setBusy(true);
    setOptResult(null);
    try {
      setOptResult(await api.optimize(optStrategy, optSymbol, interval));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Optimizer thất bại");
    } finally {
      setBusy(false);
    }
  }

  async function runWalkForward() {
    setBusy(true);
    setWfResult(null);
    try {
      setWfResult(await api.walkForward(optStrategy, optSymbol, interval));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Walk-forward thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold">🤖 Quản lý Bot</h1>
        <Link href="/" className="rounded bg-bg-hover px-3 py-1.5 text-sm hover:bg-bg-border">
          ← Dashboard
        </Link>
      </header>

      {message && (
        <p className="mb-4 rounded bg-bg-panel p-3 text-sm text-accent">{message}</p>
      )}

      {/* ===== Autotrader control ===== */}
      <section className="mb-6 rounded-lg border border-bg-border bg-bg-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">⚙️ Auto-Trading Engine</h2>
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold ${
              status?.enabled ? "bg-up/20 text-up" : "bg-bg-hover text-muted"
            }`}
          >
            {status?.enabled ? "● LIVE" : "○ OFF"}
          </span>
        </div>

        {status?.enabled && (
          <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
            <span>
              Lệnh đã mở:{" "}
              <b className="font-mono text-white">{status.trades_opened}</b>
            </span>
            {status.last_run && (
              <span>
                Chạy cuối:{" "}
                <b className="font-mono">{new Date(status.last_run).toLocaleTimeString("vi-VN")}</b>
              </span>
            )}
            {status.errors.length > 0 && (
              <span className="text-down" title={status.errors[0]}>
                ⚠️ {status.errors[status.errors.length - 1]}
              </span>
            )}
          </div>
        )}

        {!status?.enabled && (
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Sàn</span>
              <select value={venue} onChange={(e) => setVenue(e.target.value)} className={`${inputCls} w-full`}>
                {VENUES.map((v) => <option key={v}>{v}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Timeframe</span>
              <select value={interval} onChange={(e) => setIntervalState(e.target.value)} className={`${inputCls} w-full`}>
                {INTERVALS.map((iv) => <option key={iv}>{iv}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted">Risk %/lệnh</span>
              <input type="number" min={0.1} max={10} step={0.5} value={riskPct}
                     onChange={(e) => setRiskPct(Number(e.target.value))} className={`${inputCls} w-full font-mono`} />
            </label>
            <div className="flex items-end gap-2">
              <button onClick={runOnce} disabled={busy}
                      className="flex-1 rounded border border-bg-border px-2 py-1.5 text-xs hover:border-accent hover:text-accent disabled:opacity-50">
                🧪 Dry-run
              </button>
            </div>
          </div>
        )}

        {!status?.enabled ? (
          !confirming ? (
            <button onClick={() => setConfirming(true)} disabled={busy}
                    className="w-full rounded bg-accent py-2 font-semibold text-black disabled:opacity-50">
              ▶ Bật Bot
            </button>
          ) : (
            <div className="rounded border border-accent p-3">
              <p className="mb-2 text-xs leading-relaxed">
                Xác nhận bật bot tự giao dịch trên <b>{venue}</b> TF <b>{interval}</b>,
                risk <b>{riskPct}%</b> balance mỗi lệnh. Bot sẽ đặt lệnh THẬT khi có signal.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => toggle(true)} disabled={busy}
                        className="rounded bg-accent py-1.5 font-semibold text-black disabled:opacity-50">
                  XÁC NHẬN BẬT
                </button>
                <button onClick={() => setConfirming(false)} disabled={busy}
                        className="rounded bg-bg-hover py-1.5">Hủy</button>
              </div>
            </div>
          )
        ) : (
          <button onClick={() => toggle(false)} disabled={busy}
                  className="w-full rounded bg-down py-2 font-semibold text-white disabled:opacity-50">
            ■ Tắt Bot ngay
          </button>
        )}
      </section>

      {/* ===== Optimizer + Walk-forward ===== */}
      <section className="mb-6 rounded-lg border border-bg-border bg-bg-panel p-4">
        <h2 className="mb-3 text-sm font-semibold">🎯 Tối ưu & Kiểm định chiến lược</h2>
        <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Strategy</span>
            <select value={optStrategy} onChange={(e) => setOptStrategy(e.target.value)} className={`${inputCls} w-full`}>
              {strategies.map((s) => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Symbol</span>
            <input value={optSymbol} onChange={(e) => setOptSymbol(e.target.value.toUpperCase())} className={`${inputCls} w-full font-mono`} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Timeframe</span>
            <select value={interval} onChange={(e) => setIntervalState(e.target.value)} className={`${inputCls} w-full`}>
              {INTERVALS.map((iv) => <option key={iv}>{iv}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button onClick={runOptimizer} disabled={busy}
                    className="flex-1 rounded bg-accent/20 px-2 py-1.5 text-xs font-semibold text-accent hover:bg-accent/30 disabled:opacity-50">
              Optimize
            </button>
            <button onClick={runWalkForward} disabled={busy}
                    className="flex-1 rounded bg-up/20 px-2 py-1.5 text-xs font-semibold text-up hover:bg-up/30 disabled:opacity-50">
              Walk-Fwd
            </button>
          </div>
        </div>

        {/* Optimizer results */}
        {optResult && (
          <div className="mt-4">
            <div className="mb-2 text-xs text-muted">
              Đã test <b className="text-white">{optResult.combos_tested}</b> tổ hợp tham số
            </div>
            {optResult.best && (
              <div className="mb-3 rounded border border-accent/40 bg-accent/5 p-3 text-xs">
                <div className="mb-1 font-semibold text-accent">🏆 Tốt nhất (score {optResult.best.score})</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono md:grid-cols-4">
                  <span>Params: {JSON.stringify(optResult.best.params)}</span>
                  <span>Trades: {optResult.best.trades}</span>
                  <span>Win rate: {optResult.best.win_rate ?? "—"}%</span>
                  <span>PnL: {optResult.best.pnl_net >= 0 ? "+" : ""}{optResult.best.pnl_net.toFixed(2)}</span>
                  <span>PF: {optResult.best.profit_factor ?? "—"}</span>
                  <span>MaxDD: {optResult.best.max_drawdown_pct}%</span>
                </div>
              </div>
            )}
            {optResult.top.length > 1 && (
              <table className="w-full text-left text-xs">
                <thead className="text-muted">
                  <tr><th className="py-1">#</th><th>Params</th><th>Trades</th><th>WR%</th><th>PnL</th><th>PF</th><th>Score</th></tr>
                </thead>
                <tbody className="font-mono">
                  {optResult.top.slice(1, 6).map((r, i) => (
                    <tr key={i} className="border-t border-bg-border/50">
                      <td className="py-1">{i + 2}</td>
                      <td>{JSON.stringify(r.params)}</td>
                      <td>{r.trades}</td>
                      <td>{r.win_rate ?? "—"}</td>
                      <td className={r.pnl_net >= 0 ? "text-up" : "text-down"}>
                        {r.pnl_net >= 0 ? "+" : ""}{r.pnl_net.toFixed(0)}
                      </td>
                      <td>{r.profit_factor ?? "—"}</td>
                      <td className="text-accent">{r.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Walk-forward results */}
        {wfResult && (
          <div className="mt-4">
            <div
              className={`mb-2 inline-block rounded px-3 py-1 text-sm font-bold ${
                wfResult.verdict === "ROBUST"
                  ? "bg-up/20 text-up"
                  : wfResult.verdict === "MARGINAL"
                    ? "bg-accent/20 text-accent"
                    : "bg-down/20 text-down"
              }`}
            >
              Verdict: {wfResult.verdict}
            </div>
            <div className="mb-2 text-xs text-muted">
              In-sample PF: <b className="font-mono">{wfResult.avg_in_sample_pf ?? "—"}</b>{" "}
              · Out-of-sample PF: <b className="font-mono">{wfResult.avg_out_sample_pf ?? "—"}</b>{" "}
              · Ratio: <b className="font-mono">{wfResult.oos_is_ratio ?? "—"}</b>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr><th className="py-1">Fold</th><th>Params</th><th>IS PF</th><th>OOS PF</th><th>OOS Trades</th><th>OOS PnL</th></tr>
              </thead>
              <tbody className="font-mono">
                {wfResult.fold_results.map((f, i) => (
                  <tr key={i} className="border-t border-bg-border/50">
                    <td className="py-1">{String(f.fold ?? i + 1)}</td>
                    <td>
                      {f.params
                        ? JSON.stringify(f.params)
                        : String(f.note ?? "—")}
                    </td>
                    <td>{String(f.in_sample_pf ?? "—")}</td>
                    <td>{String(f.out_sample_pf ?? "—")}</td>
                    <td>{String(f.out_sample_trades ?? "—")}</td>
                    <td className={Number(f.out_sample_pnl ?? 0) >= 0 ? "text-up" : "text-down"}>
                      {String(f.out_sample_pnl ?? "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ===== Strategies reference ===== */}
      <section className="overflow-hidden rounded-lg border border-bg-border">
        <h2 className="border-b border-bg-border bg-bg-panel px-4 py-2 text-sm font-semibold">
          📚 Các chiến lược khả dụng
        </h2>
        <table className="w-full text-left text-xs">
          <tbody>
            {strategies.map((s) => (
              <tr key={s.name} className="border-b border-bg-border/50">
                <td className="px-4 py-2 font-mono font-semibold text-accent">{s.name}</td>
                <td className="px-4 py-2">{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="mt-4 text-xs text-muted">
        ⚠️ Luôn Dry-run và Walk-forward trước khi bật bot. Kết quả quá khứ không bảo đảm tương lai.
      </p>
    </main>
  );
}