"use client";

// Recent trades tape — streams the latest fills for the selected symbol.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Trade } from "@/lib/types";
import { formatPrice } from "./Watchlist";

export default function TradesTape({ symbol }: { symbol: string }) {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const t = await api.recentTrades(symbol, 25);
        if (!cancelled) setTrades(t);
      } catch {
        /* keep last */
      }
    }
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="border-b border-bg-border px-3 py-1.5 font-semibold">
        Lệnh khớp gần nhất
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full">
          <tbody className="font-mono tabular-nums">
            {trades.map((t) => (
              <tr key={t.id} className="hover:bg-bg-hover">
                <td
                  className={`w-20 px-3 py-[3px] ${
                    t.is_buyer_maker ? "text-down" : "text-up"
                  }`}
                >
                  {formatPrice(t.price)}
                </td>
                <td className="px-3 py-[3px] text-right text-muted">
                  {t.qty.toFixed(4)}
                </td>
                <td className="px-3 py-[3px] text-right text-muted">
                  {new Date(t.time).toLocaleTimeString("vi-VN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {trades.length === 0 && (
          <p className="p-3 text-center text-muted">Đang tải...</p>
        )}
      </div>
    </div>
  );
}