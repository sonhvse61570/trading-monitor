// Thin REST client. In dev, Next.js rewrites /api/* to the FastAPI backend.

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail =
        typeof body.detail === "string"
          ? body.detail
          : JSON.stringify(body.detail ?? body);
    } catch {
      /* keep statusText */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  tickers: () => request<import("./types").Ticker[]>("/api/market/tickers"),
  klines: (symbol: string, interval: string, limit = 200) =>
    request<import("./types").Candle[]>(
      `/api/market/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    ),
  orderBook: (symbol: string, limit = 20) =>
    request<import("./types").OrderBook>(
      `/api/market/orderbook?symbol=${symbol}&limit=${limit}`
    ),
  recentTrades: (symbol: string, limit = 50) =>
    request<import("./types").Trade[]>(
      `/api/market/trades?symbol=${symbol}&limit=${limit}`
    ),
  account: () => request<import("./types").AccountInfo>("/api/account"),
  positions: () => request<import("./types").Position[]>("/api/positions"),
  openOrders: () => request<import("./types").Order[]>("/api/orders/open"),
  orderHistory: (limit = 50) =>
    request<import("./types").Order[]>(`/api/orders/history?limit=${limit}`),
  placeOrder: (payload: import("./types").PlaceOrderPayload) =>
    request<Record<string, unknown>>("/api/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  cancelOrder: (orderId: string, symbol: string) =>
    request<Record<string, unknown>>(
      `/api/orders/${orderId}?symbol=${encodeURIComponent(symbol)}`,
      { method: "DELETE" }
    ),

  // Phase 2
  scanner: (venue = "binance") =>
    request<import("./types").ScanResult>(
      `/api/scanner?venue=${encodeURIComponent(venue)}`
    ),
  indicators: (symbol: string, interval = "15m") =>
    request<Record<string, unknown>>(
      `/api/indicators?symbol=${symbol}&interval=${interval}`
    ),
  strategies: () => request<import("./types").StrategyInfo[]>("/api/strategies"),
  signals: (limit = 50) =>
    request<import("./types").Signal[]>(`/api/signals?limit=${limit}`),
  runStrategies: () =>
    request<{ scanned: number; new_signals: number }>("/api/strategies/run", {
      method: "POST",
    }),
  alerts: () => request<import("./types").PriceAlert[]>("/api/alerts"),
  createAlert: (symbol: string, op: ">=" | "<=", price: number) =>
    request<import("./types").PriceAlert>("/api/alerts", {
      method: "POST",
      body: JSON.stringify({ symbol, op, price }),
    }),
  deleteAlert: (id: number) =>
    request<{ ok: boolean }>(`/api/alerts/${id}`, { method: "DELETE" }),
  performance: () =>
    request<import("./types").PerformanceMetrics>(
      "/api/analytics/performance"
    ),

  // Bot management
  autotradeStatus: () =>
    request<{
      enabled: boolean;
      last_run: number | null;
      trades_opened: number;
      errors: string[];
    }>("/api/autotrade/status"),
  autotradeToggle: (
    enabled: boolean,
    venue = "binance",
    interval = "15m",
    riskPct = 1.0
  ) =>
    request<{ enabled: boolean; venue: string; interval: string; risk_pct: number }>(
      `/api/autotrade/toggle?enabled=${enabled}&venue=${venue}&interval=${interval}&risk_pct=${riskPct}`,
      { method: "POST" }
    ),
  autotradeRunOnce: () =>
    request<{ executed: unknown[] }>("/api/autotrade/run-once", {
      method: "POST",
    }),
  optimize: (
    strategy: string,
    symbol: string,
    interval: string,
    limit = 1000,
    venue = "binance"
  ) =>
    request<{
      strategy: string;
      symbol: string;
      interval: string;
      combos_tested: number;
      best: {
        params: Record<string, number>;
        trades: number;
        win_rate: number | null;
        pnl_net: number;
        profit_factor: number | null;
        max_drawdown_pct: number;
        score: number;
      };
      top: {
        params: Record<string, number>;
        trades: number;
        win_rate: number | null;
        pnl_net: number;
        profit_factor: number | null;
        score: number;
      }[];
    }>(
      `/api/optimize?strategy=${strategy}&symbol=${symbol}&interval=${interval}&limit=${limit}&venue=${venue}`
    ),
  walkForward: (
    strategy: string,
    symbol: string,
    interval: string,
    folds = 3,
    limit = 1000,
    venue = "binance"
  ) =>
    request<{
      strategy: string;
      symbol: string;
      interval: string;
      fold_results: Record<string, unknown>[];
      avg_in_sample_pf: number | null;
      avg_out_sample_pf: number | null;
      oos_is_ratio: number | null;
      verdict: string;
    }>(
      `/api/walkforward?strategy=${strategy}&symbol=${symbol}&interval=${interval}&folds=${folds}&limit=${limit}&venue=${venue}`
    ),

  // Phase 3
  venues: () =>
    request<{ venue: string; market: string }[]>("/api/venues"),
  journal: () =>
    request<
      {
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
      }[]
    >("/api/journal"),
  createJournalEntry: (payload: {
    symbol: string;
    side: string;
    entry_price?: number;
    exit_price?: number;
    quantity?: number;
    setup?: string;
    notes?: string;
    pnl?: number;
  }) =>
    request<Record<string, unknown>>("/api/journal", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteJournalEntry: (id: number) =>
    request<{ ok: boolean }>(`/api/journal/${id}`, { method: "DELETE" }),

  backtest: (payload: {
    strategy: string;
    symbol: string;
    interval: string;
    limit: number;
    venue: string;
  }) =>
    request<{
      strategy: string;
      symbol: string;
      interval: string;
      candles_tested: number;
      total_trades: number;
      total_pnl: number;
      win_rate: number | null;
      trades: {
        side: string;
        entry: number;
        exit: number;
        pnl: number;
        entry_time: number;
        exit_time: number;
      }[];
    }>("/api/backtest", { method: "POST", body: JSON.stringify(payload) }),
};
