"use client";

// Main dashboard — assembles all panels.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useLiveTickers } from "@/lib/useLiveTickers";
import { useLiveCandles } from "@/lib/useLiveCandles";
import type { AccountInfo, Candle, Order, Position, Ticker } from "@/lib/types";
import Link from "next/link";
import Watchlist, { formatPrice } from "@/components/Watchlist";
import CandleChart from "@/components/CandleChart";
import OrderBookPanel from "@/components/OrderBookPanel";
import OrderTicket from "@/components/OrderTicket";
import AccountBar from "@/components/AccountBar";
import PositionsOrders from "@/components/PositionsOrders";
import ScannerPanel from "@/components/ScannerPanel";
import SignalsFeed from "@/components/SignalsFeed";
import RiskPanel from "@/components/RiskPanel";
import AutoTradePanel from "@/components/AutoTradePanel";
import TradesTape from "@/components/TradesTape";

const DEFAULT_SYMBOL = "BTCUSDT";

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<Ticker[]>([]);
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [interval, setIntervalState] = useState("15m");
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"watchlist" | "scanner">("watchlist");

  // Initial tickers snapshot
  useEffect(() => {
    api.tickers().then(setSnapshot).catch(() => setSnapshot([]));
  }, []);

  const tickers = useLiveTickers(snapshot);

  // Candles on symbol/interval change (REST snapshot)
  const [snapshotCandles, setSnapshotCandles] = useState<Candle[]>([]);
  useEffect(() => {
    let cancelled = false;
    setSnapshotCandles([]);
    api
      .klines(symbol, interval, 300)
      .then((c) => !cancelled && setSnapshotCandles(c))
      .catch(() => !cancelled && setSnapshotCandles([]));
    return () => {
      cancelled = true;
    };
  }, [symbol, interval]);

  // Merge live WS candle updates on top of the snapshot
  const candles = useLiveCandles(snapshotCandles, symbol, interval);

  // Poll private data every 5s (works without keys too — shows error state)
  const refreshPrivate = useCallback(async () => {
    try {
      const [acc, pos, oo, hist] = await Promise.all([
        api.account(),
        api.positions(),
        api.openOrders(),
        api.orderHistory(100),
      ]);
      setAccount(acc);
      setPositions(pos);
      setOpenOrders(oo);
      setHistory(hist);
      setAccountError(null);
    } catch (e) {
      setAccountError(e instanceof Error ? e.message : null);
    }
  }, []);

  useEffect(() => {
    refreshPrivate();
    const id = setInterval(refreshPrivate, 5000);
    return () => clearInterval(id);
  }, [refreshPrivate]);

  const selectedTicker = useMemo(
    () => tickers.find((t) => t.symbol === symbol) ?? null,
    [tickers, symbol]
  );

  // Actions
  async function handleCancel(orderId: number, sym: string) {
    setBusyOrderId(orderId);
    try {
      await api.cancelOrder(String(orderId), sym);
      await refreshPrivate();
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleClosePosition(p: Position) {
    const side = p.size > 0 ? "SELL" : "BUY";
    setBusyOrderId(-1);
    try {
      await api.placeOrder({
        symbol: p.symbol,
        side,
        order_type: "MARKET",
        quantity: Math.abs(p.size),
        reduce_only: true,
      });
      await refreshPrivate();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Đóng vị thế thất bại");
    } finally {
      setBusyOrderId(null);
    }
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-bg-border bg-bg-panel px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold tracking-wide">
            📈 TRADING MONITOR{" "}
            <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              Binance USD-M Futures
            </span>
          </h1>
          <Link
            href="/analytics"
            className="rounded border border-bg-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
          >
            📊 Analytics
          </Link>
          <Link
            href="/backtest"
            className="rounded border border-bg-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
          >
            🧪 Backtest
          </Link>
          <Link
            href="/journal"
            className="rounded border border-bg-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
          >
            📓 Journal
          </Link>
        </div>
        {selectedTicker && (
          <div className="flex items-baseline gap-3 font-mono text-sm">
            <span className="text-lg font-semibold tabular-nums">
              {formatPrice(selectedTicker.last_price)}
            </span>
            <span
              className={
                selectedTicker.change_pct >= 0 ? "text-up" : "text-down"
              }
            >
              {selectedTicker.change_pct >= 0 ? "+" : ""}
              {selectedTicker.change_pct.toFixed(2)}%
            </span>
          </div>
        )}
      </header>

      <AccountBar account={accountError ? null : account} />
      <AutoTradePanel />
      <RiskPanel />

      {/* Main grid */}
      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr_260px] grid-rows-[1fr_240px] gap-px bg-bg-border">
        {/* Sidebar: Watchlist / Scanner tabs */}
        <section className="row-span-2 grid min-h-0 grid-rows-[auto_1fr] bg-bg-panel">
          <div className="grid grid-cols-2 border-b border-bg-border">
            {(
              [
                ["watchlist", "Watchlist"],
                ["scanner", "Scanner"],
              ] as ["watchlist" | "scanner", string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setSidebarTab(id)}
                className={`py-2 text-xs ${
                  sidebarTab === id
                    ? "bg-bg-hover font-semibold text-white"
                    : "text-muted hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0">
            {sidebarTab === "watchlist" ? (
              <Watchlist tickers={tickers} selected={symbol} onSelect={setSymbol} />
            ) : (
              <ScannerPanel onSelect={setSymbol} />
            )}
          </div>
        </section>

        {/* Chart */}
        <section className="min-h-0 bg-bg-panel">
          <CandleChart
            candles={candles}
            symbol={symbol}
            interval={interval}
            onIntervalChange={setIntervalState}
          />
        </section>

        {/* Right column: order book + tape + ticket */}
        <section className="row-span-2 grid min-h-0 grid-cols-2 grid-rows-[1fr_auto] bg-bg-panel">
          <div className="col-span-2 grid min-h-0 grid-cols-2 gap-px bg-bg-border">
            <div className="min-h-0 overflow-hidden bg-bg-panel">
              <OrderBookPanel symbol={symbol} />
            </div>
            <div className="min-h-0 overflow-hidden bg-bg-panel">
              <TradesTape symbol={symbol} />
            </div>
          </div>
          <div className="col-span-2 max-h-[340px] overflow-y-auto border-t border-bg-border">
            <OrderTicket
              symbol={symbol}
              lastPrice={selectedTicker?.last_price ?? null}
              onPlaced={refreshPrivate}
            />
          </div>
        </section>

        {/* Bottom panel: positions/orders + signals */}
        <section className="col-start-2 grid min-h-0 grid-cols-[1fr_320px] gap-px bg-bg-border">
          <div className="min-h-0 bg-bg-panel">
            <PositionsOrders
              positions={positions}
              openOrders={openOrders}
              history={history}
              onCancelOrder={handleCancel}
              onClosePosition={handleClosePosition}
              busyOrderId={busyOrderId}
            />
          </div>
          <div className="min-h-0 bg-bg-panel">
            <SignalsFeed />
          </div>
        </section>
      </div>
    </main>
  );
}
