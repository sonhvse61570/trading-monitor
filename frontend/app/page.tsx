"use client";

// Main dashboard — composes header, sidebar, chart, order column, bottom.
// Data fetching & actions live here; presentation in components/dashboard/*.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useLiveTickers } from "@/lib/useLiveTickers";
import { useLiveCandles } from "@/lib/useLiveCandles";
import type { AccountInfo, Candle, Order, Position, Ticker } from "@/lib/types";
import Watchlist from "@/components/Watchlist";
import ScannerPanel from "@/components/ScannerPanel";
import CandleChart from "@/components/CandleChart";
import OrderBookPanel from "@/components/OrderBookPanel";
import OrderTicket from "@/components/OrderTicket";
import AccountBar from "@/components/AccountBar";
import PositionsOrders from "@/components/PositionsOrders";
import SignalsFeed from "@/components/SignalsFeed";
import RiskPanel from "@/components/RiskPanel";
import AutoTradePanel from "@/components/AutoTradePanel";
import TradesTape from "@/components/TradesTape";
import Toasts, { pushSignalToast } from "@/components/Toasts";
import NewsTicker from "@/components/NewsTicker";
import UpcomingEvents from "@/components/UpcomingEvents";
import MarketOverview from "@/components/MarketOverview";
import PositionCalculator from "@/components/PositionCalculator";
import IndicatorsPanel from "@/components/IndicatorsPanel";
import RangePosition from "@/components/RangePosition";
import OrderFlowStats from "@/components/OrderFlowStats";
import QuickActions from "@/components/QuickActions";
import ConfluenceGauge from "@/components/ConfluenceGauge";
import {
  DashboardHeader,
  SidebarPanel,
  type SidebarTab,
} from "@/components/dashboard";
import { subscribeWs } from "@/lib/useWsConnection";

const DEFAULT_SYMBOL = "BTCUSDT";

export default function Dashboard() {
  // ---- Market data state ----
  const [snapshot, setSnapshot] = useState<Ticker[]>([]);
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [interval, setIntervalState] = useState("15m");
  const [snapshotCandles, setSnapshotCandles] = useState<Candle[]>([]);

  // ---- Private data state ----
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  // ---- UI state ----
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("watchlist");
  const [mobileTab, setMobileTab] = useState<"chart" | "book" | "trade">("chart");
  const ticketSide: "LONG" | "SHORT" = "LONG";
  // Layout prefs — chart-first by default.
  const [stripsOpen, setStripsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ---- Data loading ----
  useEffect(() => {
    api.tickers().then(setSnapshot).catch(() => setSnapshot([]));
  }, []);

  const tickers = useLiveTickers(snapshot);

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

  const candles = useLiveCandles(snapshotCandles, symbol, interval);

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

  useEffect(() => {
    return subscribeWs((msg) => {
      if (msg.type === "signal") pushSignalToast(msg.data as never);
    });
  }, []);

  const selectedTicker = useMemo(
    () => tickers.find((t) => t.symbol === symbol) ?? null,
    [tickers, symbol]
  );

  // ---- Actions ----
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
      <DashboardHeader
        selectedTicker={selectedTicker}
        candles={candles}
        interval={interval}
      />

      <Toasts />

      {/* Control row — layout toggles */}
      <div className="flex shrink-0 items-center gap-2 border-b border-bg-border bg-bg-panel px-3 py-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
          Bảng điều khiển
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setStripsOpen((v) => !v)}
            className={`rounded px-2 py-0.5 text-[11px] ${
              stripsOpen
                ? "bg-accent/20 font-semibold text-accent"
                : "text-muted hover:bg-bg-hover hover:text-white"
            }`}
            title="Bot / Risk / Sự kiện / Tin tức"
          >
            🧰 {stripsOpen ? "Thu gọn công cụ" : "Công cụ thị trường"}
          </button>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className={`hidden rounded px-2 py-0.5 text-[11px] lg:inline-block ${
              sidebarOpen
                ? "text-muted hover:bg-bg-hover hover:text-white"
                : "bg-accent/20 font-semibold text-accent"
            }`}
            title="Ẩn/hiện sidebar phân tích"
          >
            {sidebarOpen ? "◀ Ẩn sidebar" : "▶ Sidebar"}
          </button>
        </div>
      </div>

      <AccountBar account={accountError ? null : account} />
      {stripsOpen && (
        <>
          <AutoTradePanel />
          <RiskPanel />
          <UpcomingEvents />
          <NewsTicker />
        </>
      )}
      <MarketOverview tickers={tickers} selected={symbol} onSelect={setSymbol} />
      {selectedTicker && <RangePosition ticker={selectedTicker} />}

      {/* ===== Mobile ===== */}
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
            <IndicatorsPanel symbol={symbol} interval={interval} />
            <ConfluenceGauge symbol={symbol} />
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
            <section className="max-h-[50%] shrink-0 overflow-y-auto border-b border-bg-border bg-bg-panel">
              <PositionCalculator
                symbol={symbol}
                side={ticketSide}
                lastPrice={selectedTicker?.last_price ?? null}
              />
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

      {/* ===== Desktop ===== */}
      <div className="hidden min-h-0 flex-1 grid-cols-[240px_1fr_260px] grid-rows-[1fr_240px] gap-px bg-bg-border lg:grid">
        {sidebarOpen ? (
          <SidebarPanel
            tab={sidebarTab}
            onTabChange={setSidebarTab}
            tickers={tickers}
            symbol={symbol}
            currentPrice={selectedTicker?.last_price ?? null}
            interval={interval}
            onSelect={setSymbol}
          />
        ) : (
          /* Collapsed rail — keeps grid geometry, frees 200px for chart */
          <section className="row-span-2 flex min-h-0 flex-col items-center gap-3 bg-bg-panel pt-3">
            <button
              onClick={() => setSidebarOpen(true)}
              title="Mở sidebar"
              className="rounded border border-bg-border px-1.5 py-2 text-xs text-muted hover:border-accent hover:text-accent"
            >
              ▶
            </button>
            <span
              className="mt-2 text-[10px] font-medium uppercase tracking-widest text-muted"
              style={{ writingMode: "vertical-rl" }}
            >
              Phân tích
            </span>
          </section>
        )}

        {/* Chart */}
        <section className="grid min-h-0 grid-rows-[1fr_auto] bg-bg-panel">
          <div className="min-h-0">
            <CandleChart
              candles={candles}
              symbol={symbol}
              interval={interval}
              onIntervalChange={setIntervalState}
            />
          </div>
          <IndicatorsPanel symbol={symbol} interval={interval} />
        </section>

        {/* Right column */}
        <section className="row-span-2 grid min-h-0 grid-cols-2 grid-rows-[auto_1fr_auto] bg-bg-panel">
          <OrderFlowStats symbol={symbol} />
          <div className="col-span-2 grid min-h-0 grid-cols-2 gap-px bg-bg-border">
            <div className="min-h-0 overflow-hidden bg-bg-panel">
              <OrderBookPanel symbol={symbol} />
            </div>
            <div className="min-h-0 overflow-hidden bg-bg-panel">
              <TradesTape symbol={symbol} />
            </div>
          </div>
          <div className="col-span-2 max-h-[420px] overflow-y-auto border-t border-bg-border">
            <PositionCalculator
              symbol={symbol}
              side={ticketSide}
              lastPrice={selectedTicker?.last_price ?? null}
            />
            <OrderTicket
              symbol={symbol}
              lastPrice={selectedTicker?.last_price ?? null}
              onPlaced={refreshPrivate}
            />
          </div>
        </section>

        {/* Bottom panel */}
        <section className="col-start-2 grid min-h-0 grid-cols-[1fr_320px] gap-px bg-bg-border">
          <div className="grid min-h-0 grid-rows-[1fr_auto] bg-bg-panel">
            <div className="min-h-0">
              <PositionsOrders
                positions={positions}
                openOrders={openOrders}
                history={history}
                onCancelOrder={handleCancel}
                onClosePosition={handleClosePosition}
                busyOrderId={busyOrderId}
              />
            </div>
            <QuickActions symbol={symbol} onDone={refreshPrivate} />
          </div>
          <div className="min-h-0 bg-bg-panel">
            <SignalsFeed />
          </div>
        </section>
      </div>
    </main>
  );
}
