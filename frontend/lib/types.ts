// Shared types matching the backend API responses.

export interface Ticker {
  symbol: string;
  last_price: number;
  change_pct: number;
  high_24h: number;
  low_24h: number;
  volume: number;
  quote_volume: number;
}

export interface Candle {
  time: number; // seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookLevel {
  price: number;
  qty: number;
}

export interface OrderBook {
  bids: [number, number][];
  asks: [number, number][];
}

export interface Trade {
  id: number;
  price: number;
  qty: number;
  time: number;
  is_buyer_maker: boolean;
}

export interface AccountInfo {
  total_wallet_balance: number;
  total_margin_balance: number;
  total_pnl_unrealized: number;
  available: number;
  assets: {
    asset: string;
    balance: number;
    available: number;
    pnl_unrealized: number;
  }[];
}

export interface Position {
  symbol: string;
  side: string;
  size: number;
  entry_price: number;
  mark_price: number;
  pnl_unrealized: number;
  liquidation_price: number;
  leverage: number;
  margin_type: string;
  stop_loss?: number | null;
  r_multiple?: number | null;
}

export interface Order {
  order_id: number;
  symbol: string;
  side: "BUY" | "SELL";
  type: string;
  status: string;
  price: number | null;
  stop_price: number | null;
  orig_qty: number;
  executed_qty: number;
  avg_fill_price: number | null;
  reduce_only: boolean;
  time: number;
  update_time: number;
}

export interface PlaceOrderPayload {
  symbol: string;
  side: "BUY" | "SELL";
  order_type: "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";
  quantity?: number;
  price?: number;
  stop_price?: number;
  reduce_only?: boolean;
}

// ---- Phase 2 ----

export interface ScanRow extends Ticker {
  funding_rate?: number | null;
}

export interface ScanResult {
  venue: string;
  gainers: ScanRow[];
  losers: ScanRow[];
  movers: ScanRow[];
  top_volume: ScanRow[];
  top_funding: { symbol: string; funding_rate: number }[];
  total_symbols: number;
}

export interface Signal {
  strategy: string;
  symbol: string;
  side: "LONG" | "SHORT" | "EXIT";
  reason: string;
  price: number;
  ts: number;
}

export interface StrategyInfo {
  name: string;
  description: string;
}

export interface PriceAlert {
  id: number;
  symbol: string;
  op: ">=" | "<=";
  price: number;
  triggered: boolean;
}

export interface PerformanceMetrics {
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number | null;
  total_pnl: number;
  profit_factor: number | null;
  avg_win: number | null;
  avg_loss: number | null;
  max_drawdown: number;
  max_drawdown_pct: number;
  expectancy: number | null;
  equity_curve: { i: number; cum_pnl: number }[];
  recent_trades: {
    symbol: string;
    entry: number;
    exit: number;
    qty: number;
    pnl: number;
    time: number;
  }[];
}
