"use client";

// 🧮 Position size calculator — risk-based sizing with live R:R preview.
// Inputs: account balance, risk %, entry (defaults to last price), SL.
// Outputs: qty, notional, implied leverage, 1:1/1:2/1:3 TPs.
import { useEffect, useState } from "react";
import { formatPrice } from "./Watchlist";

export default function PositionCalculator({
  symbol,
  side,
  lastPrice,
}: {
  symbol: string;
  side: "LONG" | "SHORT";
  lastPrice: number | null;
}) {
  const [balance, setBalance] = useState(10_000);
  const [riskPct, setRiskPct] = useState(1);
  const [entry, setEntry] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [tpR, setTpR] = useState(2);

  // Default entry to last price when symbol changes or empty.
  useEffect(() => {
    if (lastPrice && (!entry || parseFloat(entry) === 0)) {
      setEntry(String(lastPrice));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, lastPrice]);

  const e = parseFloat(entry) || 0;
  const sl = parseFloat(stopLoss) || 0;
  const dir = side === "LONG" ? 1 : -1;

  const valid = e > 0 && sl > 0 && (dir === 1 ? sl < e : sl > e);
  const riskUsd = (balance * riskPct) / 100;
  const perUnitRisk = Math.abs(e - sl);
  const qty = valid && perUnitRisk > 0 ? riskUsd / perUnitRisk : 0;
  const notional = qty * e;
  const leverage = balance > 0 ? notional / balance : 0;
  const tpPrice = valid ? e + dir * perUnitRisk * tpR : 0;
  const tpProfit = qty * perUnitRisk * tpR;

  return (
    <div className="border-t border-bg-border bg-bg-panel p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-muted">🧮 Position Calculator</span>
        <span className="text-[10px] text-muted">
          {side} · {symbol.replace("USDT", "")}
        </span>
      </div>

      {/* Inputs */}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-0.5 block text-[10px] text-muted">Balance ($)</span>
          <input
            type="number"
            value={balance}
            min={100}
            onChange={(ev) => setBalance(Number(ev.target.value))}
            className="w-full rounded border border-bg-border bg-bg-hover px-2 py-1 font-mono outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] text-muted">Risk (%)</span>
          <input
            type="number"
            value={riskPct}
            min={0.1}
            max={20}
            step={0.5}
            onChange={(ev) => setRiskPct(Number(ev.target.value))}
            className="w-full rounded border border-bg-border bg-bg-hover px-2 py-1 font-mono outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] text-muted">Entry</span>
          <input
            type="number"
            value={entry}
            onChange={(ev) => setEntry(ev.target.value)}
            placeholder={lastPrice ? String(lastPrice.toFixed(2)) : "..."}
            className="w-full rounded border border-bg-border bg-bg-hover px-2 py-1 font-mono outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] text-muted">
            Stop Loss {side === "LONG" ? "(dưới)" : "(trên)"}
          </span>
          <input
            type="number"
            value={stopLoss}
            onChange={(ev) => setStopLoss(ev.target.value)}
            placeholder="..."
            className={`w-full rounded border bg-bg-hover px-2 py-1 font-mono outline-none focus:border-accent ${
              sl > 0 && !valid ? "border-down" : "border-bg-border"
            }`}
          />
        </label>
      </div>

      {/* Results */}
      {valid ? (
        <>
          <div className="grid grid-cols-4 gap-2 rounded bg-bg-hover/50 p-2 text-center font-mono">
            <div>
              <div className="text-[9px] uppercase text-muted">Qty</div>
              <div className="tabular-nums">{qty.toPrecision(4)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-muted">Notional</div>
              <div className="tabular-nums">${notional.toFixed(0)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-muted">Leverage</div>
              <div
                className={`tabular-nums ${leverage > 10 ? "text-down" : ""}`}
                title={leverage > 10 ? "Đòn bẩy cao — cẩn thận!" : ""}
              >
                {leverage.toFixed(1)}×
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-muted">Risk $</div>
              <div className="tabular-nums text-down">-${riskUsd.toFixed(0)}</div>
            </div>
          </div>

          {/* TP selector + outcome */}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] text-muted">TP tại:</span>
            {[1, 2, 3].map((r) => (
              <button
                key={r}
                onClick={() => setTpR(r)}
                className={`rounded px-2 py-0.5 font-mono text-[10px] ${
                  tpR === r
                    ? "bg-up/20 text-up"
                    : "text-muted hover:bg-bg-hover"
                }`}
              >
                {r}R
              </button>
            ))}
            <span className="ml-auto font-mono tabular-nums">
              <span className="text-muted">TP @ </span>
              <b>{formatPrice(tpPrice)}</b>
              <span className="ml-2 text-up">+${tpProfit.toFixed(0)}</span>
            </span>
          </div>
        </>
      ) : (
        <p className="rounded bg-bg-hover/40 p-2 text-center text-[11px] text-muted">
          Nhập Entry + SL hợp lệ để tính khối lượng theo risk.
        </p>
      )}
    </div>
  );
}