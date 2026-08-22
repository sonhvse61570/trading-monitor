"use client";

// Main dashboard — assembles all panels.
// Responsive: mobile = tabbed single column; desktop (lg+) = terminal grid.
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
import ConnectionStatus from "@/components/ConnectionStatus";
import Toasts, { pushSignalToast } from "@/components/Toasts";
import { subscribeWs } from "@/lib/useWsConnection";

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
  const [mobileTab, setMobileTab] = useState<"chart" | "book" | "trade">("chart");

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

  // Signal toasts via shared WS connection
  useEffect(() => {
    return subscribeWs((msg) => {
      if (msg.type === "signal") pushSignalToast(msg.data as never);
    });
  }, []);

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
      <header className="flex items-center justify-between gap-2 border-b border-bg-border bg-bg-panel px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <h1 className="truncate text-sm font-bold tracking-wide">
            📈<span className="ml-1 hidden sm:inline">TRADING MONITOR</span>
            <span className="ml-1 hidden rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent md:inline">
              Binance USD-M Futures
            </span>
          </h1>
          <Link
            href="/analytics"
            className="rounded border border-bg-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
          >
            📊<span className="ml-1 hidden sm:inline">Analytics</span>
          </Link>
          <Link
            href="/backtest"
            className="rounded border border-bg-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
          >
            🧪<span className="ml-1 hidden sm:inline">Backtest</span>
          </Link>
          <Link
            href="/journal"
            className="rounded border border-bg-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
          >
            📓<span className="ml-1 hidden sm:inline">Journal</span>
          </Link>
          <Link
            href="/bot"
            className="rounded border border-accent/60 bg-accent/10 px-2 py-1 text-xs font-semibold text-accent hover:bg-accent/20"
          >
            🤖<span className="ml-1 hidden sm:inline">Bot</span>
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <ConnectionStatus />
          {selectedTicker && (
            <div className="hidden items-baseline gap-3 font-mono text-sm sm:flex">
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
        </div>
      </header>

      <Toasts />

      <AccountBar account={accountError ? null : account} />
      <AutoTradePanel />
      <RiskPanel />

      {/* ===== Mobile: tabbed single column (< lg) ===== */}
      <div className="flex min-h-0 flex-1 flex-col gap-px bg-bg-border lg:hidden">
        <nav className="grid grid-cols-3 border-b border-bg-border bg-bg-panel text-xs">
          {(
            [
              ["chart", "📈 Chart"],
              ["book", "📖 Sổ lệnh"],
              ["trade", "⚡ Giao dịch"],
            ] as ["chart" | "book" | "trade", string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMobileTab(id)}
              className={`py-2 ${
                mobileTab === id
                  ? "bg-bg-hover font-semibold text-white"
                  : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {mobileTab === "chart" && (
          <>
            <section className="h-56 shrink-0 bg-bg-panel">
              <CandleChart
                candles={candles}
                symbol={symbol}
                interval={interval}
                onIntervalChange={setIntervalState}
              />
            </section>
            <section className="min-h-0 flex-1 bg-bg-panel">
              {sidebarTab === "watchlist" ? (
                <Watchlist tickers={tickers} selected={symbol} onSelect={setSymbol} />
              ) : (
                <ScannerPanel onSelect={setSymbol} />
              )}
            </section>
            <div className="grid h-9 shrink-0 grid-cols-2 border-t border-bg-border bg-bg-panel text-xs">
              {(["watchlist", "scanner"] as const).map((id) => (
                <button
                  key={id}
                  onClick={() => setSidebarTab(id)}
                  className={
                    sidebarTab === id
                      ? "bg-bg-hover font-semibold text-white"
                      : "text-muted"
                  }
                >
                  {id === "watchlist" ? "Watchlist" : "Scanner"}
                </button>
              ))}
            </div>
          </>
        )}

        {mobileTab === "book" && (
          <>
            <section className="min-h-0 flex-1 bg-bg-panel">
              <OrderBookPanel symbol={symbol} />
            </section>
            <section className="min-h-0 flex-1 border-t border-bg-border bg-bg-panel">
              <TradesTape symbol={symbol} />
            </section>
          </>
        )}

        {mobileTab === "trade" && (
          <>
            <section className="max-h-[45%] shrink-0 overflow-y-auto border-b border-bg-border bg-bg-panel">
              <OrderTicket
                symbol={symbol}
                lastPrice={selectedTicker?.last_price ?? null}
                onPlaced={refreshPrivate}
              />
            </section>
            <section className="min-h-0 flex-1 bg-bg-panel">
              <PositionsOrders
                positions={positions}
                openOrders={openOrders}
                history={history}
                onCancelOrder={handleCancel}
                onClosePosition={handleClosePosition}
                busyOrderId={busyOrderId}
              />
            </section>
          </>
        )}
      </div>

      {/* ===== Desktop: full terminal grid (lg+) ===== */}
      <div className="hidden min-h-0 flex-1 grid-cols-[240px_1fr_260px] grid-rows-[1fr_240px] gap-px bg-bg-border lg:grid">
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