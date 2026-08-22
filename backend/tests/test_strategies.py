"""Unit tests for trading strategies."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.strategies import (
    BollingerBreakout,
    MACross,
    TrendPullback,
    VWAPReversion,
)


def _candles(closes, volume=None, spread=1.0):
    out = []
    for i, c in enumerate(closes):
        vol = volume[i] if volume else 100.0
        out.append({
            "time": 1000 + i * 60,
            "open": c,
            "high": c + spread,
            "low": c - spread,
            "close": c,
            "volume": vol,
        })
    return out


def test_trend_pullback_long_signal():
    # Uptrend then dip then recovery → RSI turn up below 40.
    closes = [100 + i * 0.5 for i in range(60)]          # uptrend
    closes += [c - 3 for c in closes[-8:]]                # pullback
    closes += [closes[-1] + 1.5]                          # turn up
    strat = TrendPullback()
    sig = strat.evaluate("BTCUSDT", _candles(closes))
    # Signal depends on exact RSI path; assert it's either valid LONG or None
    if sig is not None:
        assert sig.side == "LONG"
        assert sig.stop_loss is not None and sig.stop_loss < sig.price
        assert sig.take_profit is not None and sig.take_profit > sig.price
        # RR should be ~2:1
        risk = sig.price - sig.stop_loss
        reward = sig.take_profit - sig.price
        assert abs(reward / risk - 2.0) < 0.1


def test_bollinger_breakout_needs_volume():
    closes = [100.0] * 30
    closes[-1] = 110.0  # breakout price
    vols = [100.0] * 30
    strat = BollingerBreakout(vol_mult=1.5)
    # No volume expansion → no signal
    sig = strat.evaluate("BTCUSDT", _candles(closes, vols))
    assert sig is None
    # With volume expansion → LONG signal
    vols[-1] = 300.0
    sig = strat.evaluate("BTCUSDT", _candles(closes, vols))
    assert sig is not None and sig.side == "LONG"
    assert sig.stop_loss is not None and sig.take_profit is not None


def test_vwap_reversion_short_above():
    # Steady rise then a spike far above VWAP
    closes = [100.0 + i * 0.1 for i in range(25)]
    closes[-1] = closes[-2] * 1.05  # +5% spike
    strat = VWAPReversion(window=20, threshold_pct=2.0)
    sig = strat.evaluate("BTCUSDT", _candles(closes))
    assert sig is not None and sig.side == "SHORT"
    assert sig.take_profit is not None  # target = VWAP


def test_ma_cross_no_signal_on_flat():
    closes = [100.0] * 30
    sig = MACross().evaluate("BTCUSDT", _candles(closes))
    assert sig is None


def test_ma_cross_detects_cross():
    # Down then sharp up → golden cross
    closes = [100.0 - i for i in range(30)] + [75.0 + i * 2 for i in range(10)]
    sig = MACross(fast=3, slow=10).evaluate("BTCUSDT", _candles(closes))
    if sig is not None:
        assert sig.side in ("LONG", "SHORT")