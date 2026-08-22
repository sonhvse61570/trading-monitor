"use client";

// Quick actions row — one-click common operations.
import { useState } from "react";
import { api } from "@/lib/api";

export default function QuickActions({
  symbol,
  onDone,
}: {
  symbol: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function runStrategyScan() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.runStrategies();
      setMsg(`Quét xong: ${r.new_signals} signal mới`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(null), 4000);
    }
  }

  return (
    <div className="flex items-center gap-2 border-t border-bg-border bg-bg-panel px-3 py-1.5 text-xs">
      <button
        onClick={runStrategyScan}
        disabled={busy}
        className="rounded border border-accent/50 px-2 py-1 text-accent hover:bg-accent/10 disabled:opacity-40"
        title="Chạy tất cả strategies ngay lập tức"
      >
        ⚡ Quét signals
      </button>
      <a
        href={`/backtest?symbol=${symbol}`}
        className="rounded border border-bg-border px-2 py-1 text-muted hover:border-accent hover:text-accent"
        title={`Backtest trên ${symbol}`}
      >
        🧪 Backtest {symbol.replace("USDT", "")}
      </a>
      <a
        href="/journal"
        className="rounded border border-bg-border px-2 py-1 text-muted hover:border-accent hover:text-accent"
      >
        📓 Ghi journal
      </a>
      {msg && <span className="ml-auto text-accent">{msg}</span>}
    </div>
  );
}