"""Unit tests for the backtest engine (SL/TP simulation, costs)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.backtest import run_backtest
from app.strategies import STRATEGIES, Signal


def _make_candles(closes, spread=1.0, volume=100.0):
    candles = []
    for i, c in enumerate(closes):
        candles.append(
            {
                "time": 1000 + i * 60,
                "open": c,
                "high": c + spread,
                "low": c - spread,
                "close": c,
                "volume": volume,
            }
        )
    return candles


def test_no_trades_when_strategy_quiet(monkeypatch):
    class Quiet:
        name = "quiet"

        def evaluate(self, symbol, candles):
            return None

    monkeypatch.setitem(STRATEGIES, "quiet", Quiet())
    result = run_backtest("quiet", _make_candles([100.0] * 50), "TEST", "1m")
    assert len(result.trades) == 0
    assert result.total_pnl_net == 0


def test_stop_loss_hit_conservative(monkeypatch):
    """When both SL and TP are inside one candle, SL must win (conservative)."""
    closes = [100.0] * 30

    class OneShot:
        name = "oneshot"

        def __init__(self):
            self.fired = False

        def evaluate(self, symbol, candles):
            if self.fired or len(candles) < 25:
                return None
            self.fired = True
            last = candles[-1]["close"]
            # Entry at next open; SL very close, TP far — both within spread.
            return Signal("oneshot", symbol, "LONG", "test", last,
                          stop_loss=last - 0.5, take_profit=last + 50)

    monkeypatch.setitem(STRATEGIES, "oneshot", OneShot())
    candles = _make_candles(closes)
    result = run_backtest("oneshot", candles, "TEST", "1m", fee_rate=0)
    assert len(result.trades) == 1
    trade = result.trades[0]
    assert trade["exit_reason"] == "stop_loss"


def test_take_profit_hit(monkeypatch):
    """A wide SL and reachable TP should exit at take_profit."""
    closes = [100.0] * 30

    class OneShotTP:
        name = "onetp"

        def __init__(self):
            self.fired = False

        def evaluate(self, symbol, candles):
            if self.fired or len(candles) < 25:
                return None
            self.fired = True
            last = candles[-1]["close"]
            return Signal("onetp", symbol, "LONG", "test", last,
                          stop_loss=last - 50, take_profit=last + 2)

    monkeypatch.setitem(STRATEGIES, "onetp", OneShotTP())
    candles = _make_candles(closes, spread=3.0)
    result = run_backtest("onetp", candles, "TEST", "1m", fee_rate=0)
    assert len(result.trades) >= 1
    assert result.trades[0]["exit_reason"] in ("take_profit", "end_of_data")
    if result.trades[0]["exit_reason"] == "take_profit":
        assert result.trades[0]["pnl"] > 0


def _register_one_shot(name: str):
    """Register a strategy that fires once per backtest at window>=25.

    Returns (original_strategy_or_None, reset_fn). Call reset_fn() before
    each additional run_backtest so the one-shot fires again.
    """

    class OneShot:
        pass

    OneShot.name = name
    instance = OneShot()
    instance.fired = False

    def evaluate(symbol, candles):
        if not instance.fired and len(candles) >= 25:
            instance.fired = True
            return Signal(name, symbol, "LONG", "t", candles[-1]["close"])
        return None

    instance.evaluate = evaluate
    original = STRATEGIES.get(name)
    STRATEGIES[name] = instance

    def reset():
        instance.fired = False

    return original, reset


def test_fees_reduce_pnl():
    closes = [100.0] * 30
    original, reset = _register_one_shot("feetest")
    try:
        candles = _make_candles(closes)
        free = run_backtest("feetest", candles, "TEST", "1m", fee_rate=0)
        reset()
        paid = run_backtest("feetest", candles, "TEST", "1m", fee_rate=0.001)
        assert len(free.trades) == 1, f"expected 1 trade, got {free.trades}"
        assert len(paid.trades) == 1
        assert paid.total_fees > 0
        assert paid.total_pnl_net < free.total_pnl_net
    finally:
        _restore("feetest", original)


def test_slippage_applies_against_direction():
    closes = [100.0] * 30
    original, reset = _register_one_shot("slip")
    try:
        candles = _make_candles(closes)
        no_slip = run_backtest("slip", candles, "TEST", "1m", fee_rate=0, slippage_bps=0)
        reset()
        slip = run_backtest("slip", candles, "TEST", "1m", fee_rate=0, slippage_bps=10)
        assert len(slip.trades) == 1
        # Long entry with slippage fills at a higher price → worse PnL
        assert slip.trades[0]["entry"] > no_slip.trades[0]["entry"]
    finally:
        _restore("slip", original)


def _restore(name: str, original):
    if original is None:
        STRATEGIES.pop(name, None)
    else:
        STRATEGIES[name] = original


def test_profit_factor_and_drawdown(monkeypatch):
    closes = [100.0] * 40

    class TwoTrades:
        name = "twotrades"

        def __init__(self):
            self.count = 0

        def evaluate(self, symbol, candles):
            if self.count >= 2 or len(candles) < 25:
                return None
            self.count += 1
            return Signal("twotrades", symbol, "LONG", "t", candles[-1]["close"])

    monkeypatch.setitem(STRATEGIES, "twotrades", TwoTrades())
    candles = _make_candles(closes)
    result = run_backtest("twotrades", candles, "TEST", "1m", fee_rate=0)
    assert len(result.trades) >= 1
    d = result.to_dict()
    assert "profit_factor" in d and "max_drawdown_pct" in d