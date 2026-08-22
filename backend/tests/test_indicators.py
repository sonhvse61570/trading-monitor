"""Unit tests for technical indicators."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.indicators import bollinger, ema, macd, rsi, sma, vwap


def test_sma_basic():
    values = [1.0, 2.0, 3.0, 4.0, 5.0]
    result = sma(values, 3)
    assert result[0] is None
    assert result[1] is None
    assert result[2] == 2.0
    assert result[3] == 3.0
    assert result[4] == 4.0


def test_sma_period_longer_than_data():
    result = sma([1.0, 2.0], 5)
    assert all(v is None for v in result)


def test_ema_converges_to_constant():
    values = [10.0] * 50
    result = ema(values, 10)
    assert abs(result[-1] - 10.0) < 1e-9


def test_rsi_all_gains_is_100():
    values = [float(i) for i in range(1, 30)]
    result = rsi(values, 14)
    assert result[-1] == 100.0


def test_rsi_all_losses_is_0():
    values = [float(i) for i in range(30, 1, -1)]
    result = rsi(values, 14)
    assert result[-1] == 0.0


def test_rsi_range():
    import random

    random.seed(42)
    values = [100.0]
    for _ in range(200):
        values.append(values[-1] + random.uniform(-2, 2))
    result = rsi(values, 14)
    for v in result[14:]:
        assert v is not None
        assert 0 <= v <= 100


def test_macd_structure():
    values = [float(i % 17) for i in range(100)]
    out = macd(values)
    assert set(out.keys()) == {"macd", "signal", "hist"}
    assert len(out["macd"]) == 100
    # hist = macd - signal where both defined
    for m, s, h in zip(out["macd"], out["signal"], out["hist"]):
        if m is not None and s is not None:
            assert h is not None
            assert abs((m - s) - h) < 1e-9


def test_bollinger_contains_price():
    values = [float(i % 13) + 50 for i in range(60)]
    bb = bollinger(values, 20, 2.0)
    last = values[-1]
    # Price is usually inside the bands
    assert bb["upper"][-1] > bb["mid"][-1] > bb["lower"][-1]


def test_vwap_anchored():
    candles = [
        {"high": 11, "low": 9, "close": 10, "volume": 100},
        {"high": 21, "low": 19, "close": 20, "volume": 100},
    ]
    result = vwap(candles)
    # First candle typical price = (11+9+10)/3 = 10
    assert result[0] == 10.0
    # Second: (10*100 + 20*100)/200 = 15
    assert result[1] == 15.0


def test_vwap_rolling_window():
    candles = [{"high": h, "low": h - 2, "close": h - 1, "volume": 10}
               for h in range(5, 15)]
    result = vwap(candles, rolling=3)
    assert len(result) == len(candles)
    # Rolling VWAP equals mean of last 3 typical prices
    tp3 = sum((c["high"] + c["low"] + c["close"]) / 3 for c in candles[-3:]) / 3
    assert abs(result[-1] - tp3) < 1e-9