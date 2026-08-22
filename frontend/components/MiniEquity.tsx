"use client";

// Mini performance card — today's PnL + win rate from order history.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PerformanceMetrics } from "@/lib/types";

export default function MiniEquity() {
  const [m, setM] = useState<PerformanceMetrics | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await api.performance();
        if (!cancelled) setM(r);
      } catch {
        /* no API key — stay hidden */
      }
    }
    load();
    const id = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!m || m.total_trades === 0) return null;

  const wr = m.win_rate ?? 0;

  return (
    <div className="flex items-center gap-4 border-t border-bg-border bg-bg-panel px-3 py-1.5 text-xs">
      <span className="text-muted">📈 Hiệu suất</span>
      <span className="font-mono tabular-nums">
        <span className="text-muted">Trades </span>
        <b>{m.total_trades}</b>
      </span>
      <span className="font-mono tabular-nums">
        <span className="text-muted">WR </span>
        <b className={wr >= 50 ? "text-up" : "text-down"}>{wr.toFixed(0)}%</b>
      </span>
      <span className="font-mono tabular-nums">
        <span className="text-muted">PF </span>
        <b>{m.profit_factor?.toFixed(2) ?? "—"}</b>
      </span>
      <span
        className={`ml-auto font-mono font-semibold tabular-nums ${
          m.total_pnl >= 0 ? "text-up" : "text-down"
        }`}
      >
        {m.total_pnl >= 0 ? "+" : ""}
        {m.total_pnl.toFixed(2)}$
      </span>
    </div>
  );
}