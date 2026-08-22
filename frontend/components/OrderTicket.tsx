"use client";

// Order placement form with 2-step confirmation.
import { useState } from "react";
import { api } from "@/lib/api";
import type { PlaceOrderPayload } from "@/lib/types";
import { formatPrice } from "./Watchlist";

interface Props {
  symbol: string;
  lastPrice: number | null;
  onPlaced: () => void;
}

type Side = "BUY" | "SELL";
type OType = "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";

export default function OrderTicket({ symbol, lastPrice, onPlaced }: Props) {
  const [side, setSide] = useState<Side>("BUY");
  const [orderType, setOrderType] = useState<OType>("LIMIT");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const qtyNum = parseFloat(quantity);
  const valid =
    !isNaN(qtyNum) &&
    qtyNum > 0 &&
    (orderType === "MARKET" ||
      (parseFloat(price) > 0 && !isNaN(parseFloat(price)))) &&
    ((orderType === "STOP_MARKET" || orderType === "TAKE_PROFIT_MARKET")
      ? parseFloat(stopPrice) > 0
      : true);

  function reset() {
    setConfirming(false);
    setBusy(false);
  }

  async function submit() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    const payload: PlaceOrderPayload = {
      symbol,
      side,
      order_type: orderType,
      quantity: qtyNum,
    };
    if (orderType !== "MARKET") payload.price = parseFloat(price);
    if (orderType === "STOP_MARKET" || orderType === "TAKE_PROFIT_MARKET") {
      payload.stop_price = parseFloat(stopPrice);
    }
    try {
      const res = await api.placeOrder(payload);
      setSuccess(`Lệnh #${res.order_id} đã gửi — trạng thái ${res.status}`);
      setQuantity("");
      setPrice("");
      setStopPrice("");
      onPlaced();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gửi lệnh thất bại");
    } finally {
      reset();
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3 text-sm">
      <div className="font-semibold">Đặt lệnh</div>

      {/* Side toggle */}
      <div className="grid grid-cols-2 gap-1 rounded bg-bg-hover p-1">
        <button
          onClick={() => setSide("BUY")}
          className={`rounded py-1.5 font-semibold ${
            side === "BUY" ? "bg-up text-black" : "text-muted"
          }`}
        >
          Mua / Long
        </button>
        <button
          onClick={() => setSide("SELL")}
          className={`rounded py-1.5 font-semibold ${
            side === "SELL" ? "bg-down text-white" : "text-muted"
          }`}
        >
          Bán / Short
        </button>
      </div>

      {/* Type select */}
      <select
        value={orderType}
        onChange={(e) => setOrderType(e.target.value as OType)}
        className="rounded border border-bg-border bg-bg-hover px-2 py-1.5 outline-none"
      >
        <option value="LIMIT">Limit</option>
        <option value="MARKET">Market</option>
        <option value="STOP_MARKET">Stop Market</option>
        <option value="TAKE_PROFIT_MARKET">Take Profit Market</option>
      </select>

      <label className="text-xs text-muted">Số lượng</label>
      <input
        type="number"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        placeholder="0.00"
        className="rounded border border-bg-border bg-bg-hover px-2 py-1.5 font-mono outline-none focus:border-accent"
      />

      {orderType !== "MARKET" && (
        <>
          <label className="text-xs text-muted">Giá</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={lastPrice ? String(lastPrice) : "0.00"}
            className="rounded border border-bg-border bg-bg-hover px-2 py-1.5 font-mono outline-none focus:border-accent"
          />
        </>
      )}

      {(orderType === "STOP_MARKET" || orderType === "TAKE_PROFIT_MARKET") && (
        <>
          <label className="text-xs text-muted">Giá kích hoạt (stop)</label>
          <input
            type="number"
            value={stopPrice}
            onChange={(e) => setStopPrice(e.target.value)}
            placeholder="0.00"
            className="rounded border border-bg-border bg-bg-hover px-2 py-1.5 font-mono outline-none focus:border-accent"
          />
        </>
      )}

      {lastPrice != null && (
        <div className="text-xs text-muted">
          Giá thị trường:{" "}
          <span className="font-mono">{formatPrice(lastPrice)}</span>
        </div>
      )}

      {!confirming ? (
        <button
          disabled={!valid}
          onClick={() => setConfirming(true)}
          className={`mt-auto rounded py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
            side === "BUY" ? "bg-up text-black" : "bg-down text-white"
          }`}
        >
          {side === "BUY" ? "Mua" : "Bán"} {symbol.replace("USDT", "")}
        </button>
      ) : (
        <div className="mt-auto space-y-1 rounded border border-accent/50 p-2">
          <p className="text-xs leading-relaxed">
            Xác nhận <b>{side}</b> <b>{qtyNum}</b> {symbol}{" "}
            {orderType !== "MARKET" && <>@ {price}</>}
            {(orderType === "STOP_MARKET" ||
              orderType === "TAKE_PROFIT_MARKET") && <> trigger {stopPrice}</>}
          </p>
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={submit}
              disabled={busy}
              className="rounded bg-accent py-1.5 font-semibold text-black disabled:opacity-50"
            >
              {busy ? "Đang gửi..." : "Xác nhận"}
            </button>
            <button
              onClick={reset}
              disabled={busy}
              className="rounded bg-bg-hover py-1.5"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded bg-down/10 p-2 text-xs text-down">{error}</p>
      )}
      {success && (
        <p className="rounded bg-up/10 p-2 text-xs text-up">{success}</p>
      )}
    </div>
  );
}