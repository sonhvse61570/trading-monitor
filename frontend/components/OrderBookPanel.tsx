"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatPrice } from "./Watchlist";

interface Props {
  symbol: string;
}

export default function OrderBookPanel({ symbol }: Props) {
  const [book, setBook] = useState<{
    bids: [number, number][];
    asks: [number, number][];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const data = await api.orderBook(symbol, 15);
        if (!cancelled) setBook(data);
      } catch {
        /* keep last snapshot */
      }
    }
    poll();
    const id = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  if (!book) {
    return <div className="p-4 text-sm text-muted">Đang tải order book...</div>;
  }

  const maxQty = Math.max(
    ...book.bids.map((b) => b[1]),
    ...book.asks.map((a) => a[1])
  );

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="border-b border-bg-border px-3 py-2 font-semibold">
        Order Book
      </div>
      <div className="grid grid-cols-3 px-3 py-1 text-muted">
        <span>Giá</span>
        <span className="text-right">Size</span>
        <span className="text-right">Tổng</span>
      </div>
      {/* Asks (reversed: lowest at bottom) */}
      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
        {[...book.asks].reverse().map(([price, qty], i) => (
          <Row
            key={`a${i}`}
            price={price}
            qty={qty}
            cum={book.asks.slice(book.asks.length - i - 1).reduce((s, a) => s + a[1], 0)}
            maxQty={maxQty}
            side="ask"
          />
        ))}
      </div>
      {/* Spread */}
      <div className="my-1 border-y border-bg-border px-3 py-1 font-mono text-sm font-semibold">
        {formatPrice(book.bids[0]?.[0] ?? 0)}
        <span className="mx-2 text-muted">↔</span>
        {formatPrice(book.asks[0]?.[0] ?? 0)}
      </div>
      {/* Bids */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {book.bids.map(([price, qty], i) => (
          <Row
            key={`b${i}`}
            price={price}
            qty={qty}
            cum={book.bids.slice(0, i + 1).reduce((s, b) => s + b[1], 0)}
            maxQty={maxQty}
            side="bid"
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  price,
  qty,
  cum,
  maxQty,
  side,
}: {
  price: number;
  qty: number;
  cum: number;
  maxQty: number;
  side: "bid" | "ask";
}) {
  return (
    <div className="relative grid grid-cols-3 px-3 py-[3px] font-mono tabular-nums">
      <div
        className={`absolute inset-y-0 right-0 ${side === "bid" ? "bg-up/10" : "bg-down/10"}`}
        style={{ width: `${(cum / maxQty) * 100}%` }}
      />
      <span className={`relative ${side === "bid" ? "text-up" : "text-down"}`}>
        {formatPrice(price)}
      </span>
      <span className="relative text-right">{qty.toFixed(3)}</span>
      <span className="relative text-right text-muted">{cum.toFixed(3)}</span>
    </div>
  );
}