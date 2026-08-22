"use client";

// Risk monitor panel: exposure metrics + emergency kill switch.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface RiskSnapshot {
  available: boolean;
  wallet_balance?: number;
  unrealized_pnl?: number;
  drawdown_pct?: number;
  max_drawdown_pct?: number;
  notional?: number;
  margin_usage?: number;
  max_margin_usage?: number;
  open_positions?: number;
  max_positions?: number;
}

export default function RiskPanel() {
  const [risk, setRisk] = useState<RiskSnapshot | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/risk").then((res) => res.json());
        if (!cancelled) setRisk(r);
      } catch {
        /* keep old */
      }
    }
    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function executeKillSwitch() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/risk/kill-switch?confirm=YES", {
        method: "POST",
      });
      const body = await res.json();
      if (res.ok) {
        setMessage(
          `🛑 Đã đóng ${body.closed.length} vị thế` +
            (body.failed.length ? `, thất bại ${body.failed.length}` : "")
        );
      } else {
        setMessage(body.detail ?? "Kill switch thất bại");
      }
    } catch {
      setMessage("Kill switch thất bại");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!risk?.available) return null;

  const ddOver = (risk.drawdown_pct ?? 0) >= (risk.max_drawdown_pct ?? 10);
  const marginOver =
    (risk.margin_usage ?? 0) >= (risk.max_margin_usage ?? 0.8);
  const posOver = (risk.open_positions ?? 0) > (risk.max_positions ?? 10);
  const anyAlert = ddOver || marginOver || posOver;

  return (
    <div className="border-b border-bg-border bg-bg-panel px-4 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className={`font-semibold ${anyAlert ? "text-down" : "text-up"}`}>
          🛡️ Risk {anyAlert && "⚠️"}
        </span>
        <Metric
          label="Drawdown"
          value={`${risk.drawdown_pct}% / ${risk.max_drawdown_pct}%`}
          over={ddOver}
        />
        <Metric
          label="Margin usage"
          value={`${Math.round((risk.margin_usage ?? 0) * 100)}% / ${Math.round(
            (risk.max_margin_usage ?? 0.8) * 100
          )}%`}
          over={marginOver}
        />
        <Metric
          label="Vị thế"
          value={`${risk.open_positions} / ${risk.max_positions}`}
          over={posOver}
        />
        <Metric label="Notional" value={`$${(risk.notional ?? 0).toFixed(0)}`} />

        {/* Kill switch */}
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="ml-auto rounded border border-down/60 px-2 py-1 font-semibold text-down hover:bg-down/10"
          >
            🛑 Kill Switch
          </button>
        ) : (
          <span className="ml-auto flex items-center gap-2 rounded border border-down p-1">
            <span className="text-down">Đóng TẤT CẢ vị thế?</span>
            <button
              onClick={executeKillSwitch}
              disabled={busy}
              className="rounded bg-down px-2 py-0.5 font-semibold text-white disabled:opacity-50"
            >
              {busy ? "..." : "XÁC NHẬN"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded bg-bg-hover px-2 py-0.5"
            >
              Hủy
            </button>
          </span>
        )}
      </div>
      {message && (
        <p className="mt-1 rounded bg-bg-hover p-1.5 text-[11px]">{message}</p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  over,
}: {
  label: string;
  value: string;
  over?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-muted">{label}</span>
      <b className={`font-mono tabular-nums ${over ? "text-down" : ""}`}>
        {value}
      </b>
    </span>
  );
}