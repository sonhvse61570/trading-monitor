"""Unit tests for risk monitor snapshot logic."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.risk import risk_snapshot


def test_snapshot_unavailable():
    snap = risk_snapshot(None, [])
    assert snap == {"available": False}


def test_snapshot_healthy_account():
    account = {
        "total_wallet_balance": 1000.0,
        "total_margin_balance": 1050.0,
        "total_pnl_unrealized": 50.0,
        "available": 900.0,
    }
    positions = [
        {"size": 1.0, "mark_price": 100.0},
        {"size": -2.0, "mark_price": 50.0},
    ]
    snap = risk_snapshot(account, positions)
    assert snap["available"] is True
    assert abs(snap["notional"] - 200.0) < 0.01  # rounded to 2dp
    # Profit → no drawdown
    assert snap["drawdown_pct"] == 0.0
    assert abs(snap["margin_usage"] - round(200.0 / 1050.0, 3)) < 1e-6


def test_snapshot_drawdown():
    account = {
        "total_wallet_balance": 1000.0,
        "total_margin_balance": 900.0,
        "total_pnl_unrealized": -100.0,  # -10%
        "available": 500.0,
    }
    snap = risk_snapshot(account, [])
    assert snap["drawdown_pct"] == 10.0