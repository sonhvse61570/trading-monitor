"""Unit tests for performance analytics (FIFO pairing, drawdown)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.analytics import compute_metrics


def _order(side, qty, price, ts, status="FILLED"):
    return {
        "order_id": ts,
        "symbol": "BTCUSDT",
        "side": side,
        "type": "MARKET",
        "status": status,
        "price": price,
        "stop_price": None,
        "orig_qty": qty,
        "executed_qty": qty,
        "avg_fill_price": price,
        "reduce_only": False,
        "time": ts,
        "update_time": ts,
    }


def test_simple_win():
    orders = [
        _order("BUY", 1.0, 100.0, 1000),
        _order("SELL", 1.0, 110.0, 2000),
    ]
    m = compute_metrics(orders)
    assert m["total_trades"] == 1
    assert m["wins"] == 1
    assert m["total_pnl"] == 10.0
    assert m["win_rate"] == 100.0


def test_simple_loss():
    orders = [
        _order("BUY", 2.0, 100.0, 1000),
        _order("SELL", 2.0, 90.0, 2000),
    ]
    m = compute_metrics(orders)
    assert m["total_pnl"] == -20.0
    assert m["losses"] == 1


def test_partial_fill_fifo():
    """BUY 2 @100, SELL 1 @110, SELL 1 @105 → pnl = 10 + 5 = 15."""
    orders = [
        _order("BUY", 2.0, 100.0, 1000),
        _order("SELL", 1.0, 110.0, 2000),
        _order("SELL", 1.0, 105.0, 3000),
    ]
    m = compute_metrics(orders)
    assert m["total_trades"] == 2
    assert m["total_pnl"] == 15.0


def test_unfilled_orders_ignored():
    orders = [
        _order("BUY", 1.0, 100.0, 1000, status="CANCELED"),
        _order("SELL", 1.0, 110.0, 2000, status="NEW"),
    ]
    m = compute_metrics(orders)
    assert m["total_trades"] == 0


def test_profit_factor():
    orders = [
        _order("BUY", 1.0, 100.0, 1000),
        _order("SELL", 1.0, 120.0, 2000),  # +20
        _order("BUY", 1.0, 100.0, 3000),
        _order("SELL", 1.0, 90.0, 4000),   # -10
    ]
    m = compute_metrics(orders)
    assert m["profit_factor"] == 2.0
    assert m["win_rate"] == 50.0
    assert m["expectancy"] == 5.0


def test_equity_curve_and_drawdown():
    orders = [
        _order("BUY", 1.0, 100.0, 1000),
        _order("SELL", 1.0, 130.0, 2000),  # +30
        _order("BUY", 1.0, 130.0, 3000),
        _order("SELL", 1.0, 110.0, 4000),  # -20 → cum 10
    ]
    m = compute_metrics(orders)
    assert m["max_drawdown"] == 20.0
    assert m["max_drawdown_pct"] > 0
    assert len(m["equity_curve"]) >= 3


def test_empty_orders():
    m = compute_metrics([])
    assert m["total_trades"] == 0
    assert m["win_rate"] is None