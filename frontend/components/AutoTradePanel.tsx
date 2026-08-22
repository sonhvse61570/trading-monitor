"use client";

// Auto-trader control panel — enable/disable bot with safety params.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Status {
  enabled: boolean;
  last_run: number | null;
  trades_opened: number;
  errors: string[];
}

export default function AutoTradePanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [venue, setVenue] = useState("binance");
  const [interval, setIntervalState] = useState("15m");
  const [riskPct, setRiskPct] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const s = await fetch("/api/autotrade/status").then((r) => r.json());
      setStatus(s);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  async function toggle(enabled: boolean) {
    setBusy(true);
    try {
      await fetch(
        `/api/autotrade/toggle?enabled=${enabled}&venue=${venue}&interval=${interval}&risk_pct=${riskPct}`,
        { method: "POST" }
      );
      await load();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!status) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-bg-border bg-bg-panel px-4 py-2 text-xs">
      <span
        className={`font-semibold ${
          status.enabled ? "text-up" : "text-muted"
        }`}
      >
        ⚙️ Auto-Trader {status.enabled ? "● LIVE" : "○ OFF"}
      </span>

      {status.enabled && (
        <>
          <span className="text-muted">
            Đã mở <b className="font-mono">{status.trades_opened}</b> lệnh
          </span>
          {status.last_run && (
            <span className="text-muted">
              Chạy lúc{" "}
              {new Date(status.last_run).toLocaleTimeString("vi-VN")}
            </span>
          )}
          {status.errors.length > 0 && (
            <span
              className="max-w-[300px] truncate text-down"
              title={status.errors[0]}
            >
              ⚠️ {status.errors[0]}
            </span>
          )}
        </>
      )}

      {!status.enabled && (
        <>
          <select
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            className="rounded border border-bg-border bg-bg-hover px-1.5 py-0.5"
          >
            <option value="binance">binance</option>
            <option value="okx">okx</option>
            <option value="bybit">bybit</option>
          </select>
          <select
            value={interval}
            onChange={(e) => setIntervalState(e.target.value)}
            className="rounded border border-bg-border bg-bg-hover px-1.5 py-0.5"
          >
            {["5m", "15m", "1h", "4h"].map((iv) => (
              <option key={iv}>{iv}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-muted">
            Risk %
            <input
              type="number"
              min={0.1}
              max={10}
              step={0.5}
              value={riskPct}
              onChange={(e) => setRiskPct(Number(e.target.value))}
              className="w-14 rounded border border-bg-border bg-bg-hover px-1.5 py-0.5 font-mono"
            />
          </label>
        </>
      )}

      <div className="ml-auto">
        {!status.enabled ? (
          !confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="rounded border border-accent/60 px-2 py-1 font-semibold text-accent hover:bg-accent/10"
            >
              ▶ Bật Bot
            </button>
          ) : (
            <span className="flex items-center gap-2 rounded border border-accent p-1">
              <span className="text-accent">
                Bật bot risk {riskPct}%/lệnh?
              </span>
              <button
                onClick={() => toggle(true)}
                disabled={busy}
                className="rounded bg-accent px-2 py-0.5 font-semibold text-black disabled:opacity-50"
              >
                XÁC NHẬN
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded bg-bg-hover px-2 py-0.5"
              >
                Hủy
              </button>
            </span>
          )
        ) : (
          <button
            onClick={() => toggle(false)}
            disabled={busy}
            className="rounded border border-down/60 px-2 py-1 font-semibold text-down hover:bg-down/10"
          >
            ■ Tắt Bot
          </button>
        )}
      </div>
    </div>
  );
}