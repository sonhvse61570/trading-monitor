"use client";

// Price alerts manager — create & delete inline.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PriceAlert } from "@/lib/types";

const inputCls =
  "w-full rounded bg-bg-hover px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-accent";

export default function AlertsPanel({ symbol }: { symbol: string }) {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [op, setOp] = useState<">=" | "<=">(">=");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAlerts(await api.alerts());
    } catch {
      /* keep old */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  async function create() {
    const p = parseFloat(price);
    if (!p || p <= 0) return;
    setBusy(true);
    try {
      await api.createAlert(symbol, op, p);
      setPrice("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await api.deleteAlert(id);
    await load();
  }

  return (
    <div className="flex h-full flex-col">
      {/* Create form */}
      <div className="border-b border-bg-border p-2">
        <div className="mb-1.5 flex items-center gap-1">
          <select
            value={op}
            onChange={(e) => setOp(e.target.value as ">=" | "<=")}
            className={`${inputCls} w-16`}
          >
            <option value=">=">≥</option>
            <option value="<=">≤</option>
          </select>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={`Giá ${symbol.replace("USDT", "")}...`}
            className={`${inputCls} flex-1 font-mono`}
          />
          <button
            onClick={create}
            disabled={busy || !price}
            className="shrink-0 rounded bg-accent px-2 py-1 text-xs font-semibold text-black disabled:opacity-40"
          >
            +
          </button>
        </div>
        <p className="text-[10px] leading-snug text-muted">
          🔔 Báo qua Telegram khi giá chạm mức (cần cấu hình bot)
        </p>
      </div>

      {/* Active alerts */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {alerts.map((a) => (
          <div
            key={a.id}
            className={`flex items-center gap-2 border-b border-bg-border/50 px-3 py-1.5 text-xs font-mono ${
              a.triggered ? "opacity-50" : ""
            }`}
          >
            <span>{a.triggered ? "✅" : "🔔"}</span>
            <span className="font-semibold">{a.symbol.replace("USDT", "")}</span>
            <span className="text-muted">{a.op}</span>
            <span className="tabular-nums">{a.price.toLocaleString("vi-VN")}</span>
            <button
              onClick={() => remove(a.id)}
              className="ml-auto text-muted hover:text-down"
              title="Xóa alert"
            >
              ✕
            </button>
          </div>
        ))}
        {alerts.length === 0 && (
          <p className="p-4 text-center text-xs text-muted">
            Chưa có alert nào.
          </p>
        )}
      </div>
    </div>
  );
}