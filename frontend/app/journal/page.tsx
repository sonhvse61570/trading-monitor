"use client";

// Trade journal — log setups, notes, and PnL per trade.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface JournalEntry {
  id: number;
  created_at: number;
  symbol: string;
  side: string;
  entry_price: number | null;
  exit_price: number | null;
  quantity: number | null;
  setup: string;
  notes: string;
  pnl: number | null;
}

const inputCls =
  "w-full rounded border border-bg-border bg-bg-hover px-2 py-1.5 text-sm outline-none focus:border-accent";

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [form, setForm] = useState({
    symbol: "BTCUSDT",
    side: "LONG",
    entry_price: "",
    exit_price: "",
    quantity: "",
    setup: "",
    notes: "",
    pnl: "",
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setEntries(await api.journal());
    } catch {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (!form.symbol || !form.side) return;
    setBusy(true);
    try {
      await api.createJournalEntry({
        symbol: form.symbol.toUpperCase(),
        side: form.side,
        entry_price: form.entry_price ? parseFloat(form.entry_price) : undefined,
        exit_price: form.exit_price ? parseFloat(form.exit_price) : undefined,
        quantity: form.quantity ? parseFloat(form.quantity) : undefined,
        setup: form.setup,
        notes: form.notes,
        pnl: form.pnl ? parseFloat(form.pnl) : undefined,
      });
      setForm({ ...form, entry_price: "", exit_price: "", quantity: "", setup: "", notes: "", pnl: "" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await api.deleteJournalEntry(id);
    await load();
  }

  const totalPnl = entries.reduce((s, e) => s + (e.pnl ?? 0), 0);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-bold">📓 Trade Journal</h1>
        <div className="flex gap-2">
          <Link href="/" className="rounded bg-bg-hover px-3 py-1.5 text-sm hover:bg-bg-border">
            ← Dashboard
          </Link>
          <Link href="/analytics" className="rounded bg-bg-hover px-3 py-1.5 text-sm hover:bg-bg-border">
            📊 Analytics
          </Link>
        </div>
      </header>

      {/* New entry form */}
      <section className="mb-6 rounded-lg border border-bg-border bg-bg-panel p-4">
        <h2 className="mb-3 text-sm font-semibold">Ghi nhận giao dịch mới</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Symbol</span>
            <input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Side</span>
            <select value={form.side} onChange={(e) => setForm({ ...form, side: e.target.value })} className={inputCls}>
              <option>LONG</option>
              <option>SHORT</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Entry giá</span>
            <input type="number" value={form.entry_price} onChange={(e) => setForm({ ...form, entry_price: e.target.value })} placeholder="0.00" className={`${inputCls} font-mono`} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Exit giá</span>
            <input type="number" value={form.exit_price} onChange={(e) => setForm({ ...form, exit_price: e.target.value })} placeholder="0.00" className={`${inputCls} font-mono`} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Số lượng</span>
            <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="0.00" className={`${inputCls} font-mono`} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">PnL ($)</span>
            <input type="number" value={form.pnl} onChange={(e) => setForm({ ...form, pnl: e.target.value })} placeholder="0.00" className={`${inputCls} font-mono`} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Setup (tag)</span>
            <input value={form.setup} onChange={(e) => setForm({ ...form, setup: e.target.value })} placeholder="breakout, pullback..." className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Ghi chú</span>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="lý do vào/ra lệnh..." className={inputCls} />
          </label>
        </div>
        <button onClick={submit} disabled={busy}
                className="mt-3 w-full rounded bg-accent py-2 font-semibold text-black disabled:opacity-50">
          {busy ? "Đang lưu..." : "+ Thêm vào journal"}
        </button>
      </section>

      {/* Summary */}
      <section className="mb-4 flex items-center gap-4 text-sm">
        <span className="text-muted">{entries.length} ghi nhận</span>
        <span className={totalPnl >= 0 ? "font-mono text-up" : "font-mono text-down"}>
          Tổng PnL: {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}$
        </span>
      </section>

      {/* Entries table */}
      <section className="overflow-hidden rounded-lg border border-bg-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-bg-panel text-muted">
            <tr>
              <th className="px-3 py-1.5">Thời gian</th>
              <th className="px-3 py-1.5">Symbol</th>
              <th className="px-3 py-1.5">Side</th>
              <th className="px-3 py-1.5">Entry → Exit</th>
              <th className="px-3 py-1.5">Qty</th>
              <th className="px-3 py-1.5">Setup</th>
              <th className="px-3 py-1.5">Ghi chú</th>
              <th className="px-3 py-1.5">PnL</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-bg-border/50 align-top hover:bg-bg-hover">
                <td className="px-3 py-1.5">{new Date(e.created_at).toLocaleString("vi-VN")}</td>
                <td className="px-3 py-1.5 font-semibold">{e.symbol.replace("USDT", "")}</td>
                <td className={`px-3 py-1.5 ${e.side === "LONG" ? "text-up" : "text-down"}`}>{e.side}</td>
                <td className="px-3 py-1.5 tabular-nums">{e.entry_price ?? "—"} → {e.exit_price ?? "—"}</td>
                <td className="px-3 py-1.5 tabular-nums">{e.quantity ?? "—"}</td>
                <td className="px-3 py-1.5">{e.setup && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">{e.setup}</span>}</td>
                <td className="max-w-[200px] px-3 py-1.5 font-sans">{e.notes}</td>
                <td className={`px-3 py-1.5 tabular-nums ${(e.pnl ?? 0) >= 0 ? "text-up" : "text-down"}`}>
                  {e.pnl != null ? `${e.pnl >= 0 ? "+" : ""}${e.pnl.toFixed(2)}` : "—"}
                </td>
                <td className="px-3 py-1.5">
                  <button onClick={() => remove(e.id)} className="text-muted hover:text-down">✕</button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-muted">Chưa có ghi nhận nào.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}