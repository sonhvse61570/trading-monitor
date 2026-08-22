"use client";

// Order book imbalance (buy/sell pressure) from depth data.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function OrderFlowStats({ symbol }: { symbol: string }) {
  const [imbalance, setImbalance] = useState<number | null>(null);
  const [spreadBps, setSpreadBps] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const ob = await api.orderBook(symbol, 20);
        if (cancelled || !ob.bids?.length || !ob.asks?.length) return;
        const bidVol = ob.bids.reduce((s, b) => s + b[1], 0);
        const askVol = ob.asks.reduce((s, a) => s + a[1], 0);
        const total = bidVol + askVol;
        setImbalance(total > 0 ? ((bidVol - askVol) / total) * 100 : 0);
        const bestBid = ob.bids[0][0];
        const bestAsk = ob.asks[0][0];
        setSpreadBps(((bestAsk - bestBid) / ((bestBid + bestAsk) / 2)) * 10_000);
      } catch {
        /* keep old */
      }
    }
    load();
    const id = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  if (imbalance === null) return null;

  // Map -100..100 to 0..100 for the bar.
  const buyPct = (imbalance + 100) / 2;

  return (
    <div
      className="flex items-center gap-3 border-t border-bg-border bg-bg-panel px-3 py-1.5 text-xs"
      title="Áp lực mua/bán từ độ sâu sổ lệnh top 20 mức"
    >
      <span className="text-muted">⚖️ Áp lực</span>
      <div className="flex flex-1 items-center gap-2">
        <span className="w-12 text-right font-mono text-up">
          {((100 - buyPct)).toFixed(0)}% BÁN
        </span>
        <div className="relative h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-down/40">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-up/70 transition-all duration-500"
            style={{ width: `${buyPct}%` }}
          />
        </div>
        <span className="w-12 font-mono text-up">{buyPct.toFixed(0)}% MUA</span>
      </div>
      {spreadBps !== null && (
        <span className="font-mono tabular-nums text-muted" title="Spread bid-ask">
          spread {spreadBps.toFixed(1)}bps
        </span>
      )}
    </div>
  );
}