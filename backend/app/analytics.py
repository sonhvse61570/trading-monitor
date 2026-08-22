"""Performance analytics computed from order history fills."""
from __future__ import annotations

from typing import Any


def compute_metrics(orders: list[dict[str, Any]]) -> dict[str, Any]:
    """Derive trading performance stats from closed (FILLED) orders.

    PnL per round-trip is approximated by pairing SELL fills against the
    preceding BUY fill of the same symbol (FIFO). Fees are not included
    here because Binance's allOrders endpoint omits commission.
    """
    filled = [
        o for o in orders
        if o["status"] == "FILLED" and o["avg_fill_price"]
    ]
    trades = _pair_round_trips(filled)

    wins = [t for t in trades if t["pnl"] > 0]
    losses = [t for t in trades if t["pnl"] <= 0]
    gross_win = sum(t["pnl"] for t in wins)
    gross_loss = abs(sum(t["pnl"] for t in losses))

    total_pnl = sum(t["pnl"] for t in trades)
    equity = _equity_curve(trades)
    max_dd, peak_dd_pct = _max_drawdown(equity)

    return {
        "total_trades": len(trades),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": round(len(wins) / len(trades) * 100, 2) if trades else None,
        "total_pnl": round(total_pnl, 4),
        "profit_factor": (
            round(gross_win / gross_loss, 3) if gross_loss > 0 else None
        ),
        "avg_win": round(gross_win / len(wins), 4) if wins else None,
        "avg_loss": round(-gross_loss / len(losses), 4) if losses else None,
        "max_drawdown": round(max_dd, 4),
        "max_drawdown_pct": round(peak_dd_pct, 2),
        "expectancy": round(total_pnl / len(trades), 4) if trades else None,
        "equity_curve": equity[-200:],  # cap payload size
        "recent_trades": list(reversed(trades[:50])),  # newest first for UI
    }


def _pair_round_trips(
    filled: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """FIFO-pair BUY→SELL per symbol into round-trip trades with PnL."""
    open_buys: dict[str, list[dict[str, Any]]] = {}
    trades: list[dict[str, Any]] = []

    for o in sorted(filled, key=lambda x: x["time"]):
        sym = o["symbol"]
        qty = o["executed_qty"] or o["orig_qty"]
        price = o["avg_fill_price"] or 0.0
        if o["side"] == "BUY":
            open_buys.setdefault(sym, []).append({"qty": qty, "price": price})
        elif o["side"] == "SELL" and open_buys.get(sym):
            buy = open_buys[sym].pop(0)
            matched = min(buy["qty"], qty)
            pnl = (price - buy["price"]) * matched
            trades.append(
                {
                    "symbol": sym,
                    "entry": buy["price"],
                    "exit": price,
                    "qty": matched,
                    "pnl": round(pnl, 6),
                    "time": o["update_time"],
                }
            )
            # remainder handling (partial matches)
            if qty > buy["qty"]:
                leftover = qty - buy["qty"]
                open_buys[sym].insert(
                    0, {"qty": leftover, "price": buy["price"]}
                )
            elif buy["qty"] > qty:
                open_buys[sym].insert(
                    0, {"qty": buy["qty"] - qty, "price": buy["price"]}
                )
    return trades


def _equity_curve(trades: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build cumulative PnL curve. `trades` comes out of FIFO pairing in
    chronological (oldest-first) order already."""
    curve: list[dict[str, Any]] = [{"i": 0, "cum_pnl": 0.0}]
    cum = 0.0
    for i, t in enumerate(trades, start=1):
        cum += t["pnl"]
        curve.append({"i": i, "cum_pnl": round(cum, 6)})
    return curve


def _max_drawdown(curve: list[dict[str, Any]]) -> tuple[float, float]:
    peak = 0.0
    max_dd = 0.0
    dd_pct = 0.0
    for point in curve:
        v = point["cum_pnl"]
        peak = max(peak, v)
        dd = peak - v
        if dd > max_dd:
            max_dd = dd
            dd_pct = (dd / peak * 100) if peak > 0 else 0.0
    return max_dd, dd_pct