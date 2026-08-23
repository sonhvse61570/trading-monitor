"use client";

// 📋 Trade Setup — auto-generated actionable plan (entry/SL/TP1-3).
import { useEffect, useState } from "react";
import { formatPrice } from "./Watchlist";

interface Target {
  label: string;
  price: number;
  r: number;
}

interface Setup {
  side: "LONG" | "SHORT";
  confidence: number;
  status: string;
  entry_zone: [number, number];
  stop_loss: number;
  targets: Target[];
  invalidation: string;
  notes: string[];
}

interface Data {
  score: number;
  bias: string;
  last_price: number;
  setups: Setup[];
  no_setup_reason: string | null;
}

export default function TradeSetupCard({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(`/api/analysis/setup?symbol=${symbol}`).then((x) =>
          x.json()
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

  const setup = data.setups[0];

  if (!setup) {
    return (
      <div className="border-t border-bg-border bg-bg-panel px-3 py-2 text-xs">
        <span className="text-muted">📋 Setup: </span>
        <span className="text-accent">{data.no_setup_reason}</span>
      </div>
    );
  }

  const isLong = setup.side === "LONG";

  return (
    <div
      className={`border-t bg-bg-panel px-3 py-2 text-xs ${
        isLong ? "border-up/40" : "border-down/40"
      }`}
    >
      {/* Header */}
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 font-bold ${
            isLong ? "bg-up text-black" : "bg-down text-white"
          }`}
        >
          📋 {setup.side}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            setup.status === "READY"
              ? "bg-up/20 text-up"
              : "bg-accent/15 text-accent"
          }`}
        >
          {setup.status === "READY" ? "✓ SẴN SÀNG" : "⏳ CHỜ PULLBACK"}
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted">
          confidence {setup.confidence}%
        </span>
      </div>

      {/* Plan grid */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 font-mono">
        <span className="text-muted">Entry</span>
        <span className="tabular-nums">
          {formatPrice(setup.entry_zone[0])} – {formatPrice(setup.entry_zone[1])}
        </span>
        <span className="text-[9px] text-muted">limit zone</span>

        <span className="text-muted">SL</span>
        <span className="tabular-nums text-down">{formatPrice(setup.stop_loss)}</span>
        <span />

        {setup.targets.map((t) => (
          <Fragment key={t.label}>
            <span className={t.r >= 2 ? "text-up" : "text-muted"}>{t.label}</span>
            <span className="tabular-nums">{formatPrice(t.price)}</span>
            <span className="text-[9px] text-muted">{t.r}R</span>
          </Fragment>
        ))}
      </div>

      {/* Invalidation */}
      <p className="mt-1.5 rounded bg-bg-hover/50 p-1.5 text-[10px] leading-snug text-muted">
        ❌ Hủy setup nếu: {setup.invalidation}
      </p>
    </div>
  );
}

import { Fragment } from "react";