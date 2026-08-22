"""Strategy engine — pluggable strategies that generate signals.

A strategy is any class implementing `evaluate(candles) -> Signal | None`.
Built-in strategies run on a schedule; external bots can POST signals
via the webhook endpoint instead.
"""
from __future__ import annotations

import time
from abc import ABC, abstractmethod
from typing import Any

from app import indicators as ind


class Signal:
    def __init__(
        self,
        strategy: str,
        symbol: str,
        side: str,  # "LONG" | "SHORT" | "EXIT"
        reason: str,
        price: float,
        ts: int | None = None,
        stop_loss: float | None = None,
        take_profit: float | None = None,
    ) -> None:
        self.strategy = strategy
        self.symbol = symbol
        self.side = side
        self.reason = reason
        self.price = price
        self.ts = ts or int(time.time() * 1000)
        self.stop_loss = stop_loss
        self.take_profit = take_profit

    def to_dict(self) -> dict[str, Any]:
        return {
            "strategy": self.strategy,
            "symbol": self.symbol,
            "side": self.side,
            "reason": self.reason,
            "price": self.price,
            "ts": self.ts,
            "stop_loss": self.stop_loss,
            "take_profit": self.take_profit,
        }


class Strategy(ABC):
    name = "base"
    description = ""

    @abstractmethod
    def evaluate(self, symbol: str, candles: list[dict[str, Any]]) -> Signal | None: ...


class RSIMeanReversion(Strategy):
    """Buy oversold dips / sell overbought rips on the given timeframe."""

    name = "rsi_mean_reversion"
    description = "RSI(14) < 30 → LONG; RSI > 70 → SHORT"

    def __init__(self, period: int = 14, low: float = 30, high: float = 70) -> None:
        self.period = period
        self.low = low
        self.high = high

    def evaluate(self, symbol: str, candles: list[dict[str, Any]]) -> Signal | None:
        if len(candles) < self.period + 2:
            return None
        closes = [c["close"] for c in candles]
        value = ind.latest(ind.rsi(closes, self.period))
        if value is None:
            return None
        last_close = closes[-1]
        if value <= self.low:
            return Signal(self.name, symbol, "LONG",
                          f"RSI {value:.1f} ≤ {self.low} (oversold)", last_close)
        if value >= self.high:
            return Signal(self.name, symbol, "SHORT",
                          f"RSI {value:.1f} ≥ {self.high} (overbought)", last_close)
        return None


class MACross(Strategy):
    """Classic trend-following: fast MA crosses above/below slow MA."""

    name = "ma_cross"
    description = "EMA(fast) crosses EMA(slow)"

    def __init__(self, fast: int = 9, slow: int = 21) -> None:
        self.fast = fast
        self.slow = slow

    def evaluate(self, symbol: str, candles: list[dict[str, Any]]) -> Signal | None:
        need = self.slow + 3
        if len(candles) < need:
            return None
        closes = [c["close"] for c in candles]
        ema_f = ind.ema(closes, self.fast)
        ema_s = ind.ema(closes, self.slow)
        f1, s1 = ema_f[-1], ema_s[-1]
        f2, s2 = ema_f[-2], ema_s[-2]
        if None in (f1, s1, f2, s2):
            return None
        crossed_up = f2 <= s2 and f1 > s1  # type: ignore[operator]
        crossed_down = f2 >= s2 and f1 < s1  # type: ignore[operator]
        if crossed_up:
            return Signal(self.name, symbol, "LONG",
                          f"EMA{self.fast} crossed above EMA{self.slow}", closes[-1])
        if crossed_down:
            return Signal(self.name, symbol, "SHORT",
                          f"EMA{self.fast} crossed below EMA{self.slow}", closes[-1])
        return None


import logging

logger = logging.getLogger(__name__)

class TrendPullback(Strategy):
    """Trade WITH the trend on pullbacks.

    LONG when: close > EMA(50) (uptrend), RSI dips below 40 then turns up.
    SHORT mirrored. Exits via ATR-based SL/TP carried on the signal.
    """

    name = "trend_pullback"
    description = (
        "EMA50 trend filter + RSI pullback entry; "
        "SL = 1.5×ATR, TP = 3×ATR (1:2 RR)"
    )

    def __init__(
        self,
        trend_period: int = 50,
        rsi_period: int = 14,
        rsi_low: float = 40,
        rsi_high: float = 60,
        atr_period: int = 14,
        sl_atr: float = 1.5,
        tp_atr: float = 3.0,
    ) -> None:
        self.trend_period = trend_period
        self.rsi_period = rsi_period
        self.rsi_low = rsi_low
        self.rsi_high = rsi_high
        self.atr_period = atr_period
        self.sl_atr = sl_atr
        self.tp_atr = tp_atr

    @staticmethod
    def _atr(candles: list[dict[str, Any]], period: int) -> float | None:
        if len(candles) < period + 1:
            return None
        trs = []
        for i in range(1, len(candles)):
            c = candles[i]
            prev_close = candles[i - 1]["close"]
            tr = max(
                c["high"] - c["low"],
                abs(c["high"] - prev_close),
                abs(c["low"] - prev_close),
            )
            trs.append(tr)
        recent = trs[-period:]
        return sum(recent) / len(recent)

    def evaluate(self, symbol: str, candles: list[dict[str, Any]]) -> Signal | None:
        need = max(self.trend_period, self.rsi_period, self.atr_period) + 5
        if len(candles) < need:
            return None
        closes = [c["close"] for c in candles]
        ema_trend = ind.latest(ind.ema(closes, self.trend_period))
        rsi_now = ind.latest(ind.rsi(closes, self.rsi_period))
        rsi_prev = ind.rsi(closes, self.rsi_period)[-2]
        atr = self._atr(candles, self.atr_period)
        if None in (ema_trend, rsi_now, rsi_prev, atr):
            return None
        last = closes[-1]
        # Uptrend + RSI turning up from oversold-ish zone
        if last > ema_trend and rsi_prev is not None:
            if rsi_prev < self.rsi_low <= rsi_now:
                return Signal(
                    self.name, symbol, "LONG",
                    f"Trend up (EMA{self.trend_period}), RSI turn {rsi_prev:.0f}→{rsi_now:.0f}",
                    last,
                    stop_loss=round(last - self.sl_atr * atr, 6),
                    take_profit=round(last + self.tp_atr * atr, 6),
                )
        # Downtrend + RSI turning down from overbought-ish zone
        if last < ema_trend and rsi_prev is not None:
            if rsi_prev > self.rsi_high >= rsi_now:
                return Signal(
                    self.name, symbol, "SHORT",
                    f"Trend down (EMA{self.trend_period}), RSI turn {rsi_prev:.0f}→{rsi_now:.0f}",
                    last,
                    stop_loss=round(last + self.sl_atr * atr, 6),
                    take_profit=round(last - self.tp_atr * atr, 6),
                )
        return None


class BollingerBreakout(Strategy):
    """Volatility breakout: close outside the bands with volume expansion."""

    name = "bollinger_breakout"
    description = (
        "Close beyond Bollinger(20,2) + volume > 1.5×avg20; "
        "SL = mid band, TP = 2×band width"
    )

    def __init__(self, period: int = 20, num_std: float = 2.0, vol_mult: float = 1.5) -> None:
        self.period = period
        self.num_std = num_std
        self.vol_mult = vol_mult

    def evaluate(self, symbol: str, candles: list[dict[str, Any]]) -> Signal | None:
        if len(candles) < self.period + 2:
            return None
        closes = [c["close"] for c in candles]
        vols = [c["volume"] for c in candles]
        bb = ind.bollinger(closes, self.period, self.num_std)
        upper = ind.latest(bb["upper"])
        lower = ind.latest(bb["lower"])
        mid = ind.latest(bb["mid"])
        avg_vol = sum(vols[-self.period : -1]) / (self.period - 1)
        last = closes[-1]
        vol_ok = vols[-1] > avg_vol * self.vol_mult
        if None in (upper, lower, mid):
            return None
        width = (upper - lower) or 0
        if last > upper and vol_ok:
            return Signal(
                self.name, symbol, "LONG",
                f"Breakout above BB upper w/ volume {vols[-1]/avg_vol:.1f}x",
                last,
                stop_loss=round(mid, 6),
                take_profit=round(last + 2 * width, 6),
            )
        if last < lower and vol_ok:
            return Signal(
                self.name, symbol, "SHORT",
                f"Breakdown below BB lower w/ volume {vols[-1]/avg_vol:.1f}x",
                last,
                stop_loss=round(mid, 6),
                take_profit=round(last - 2 * width, 6),
            )
        return None


class VWAPReversion(Strategy):
    """Intraday mean reversion: fade extensions from rolling VWAP."""

    name = "vwap_reversion"
    description = (
        "Price > 2% above rolling VWAP(20) → SHORT; < 2% below → LONG; "
        "target = VWAP, SL = 1×deviation"
    )

    def __init__(self, window: int = 20, threshold_pct: float = 2.0) -> None:
        self.window = window
        self.threshold_pct = threshold_pct

    def evaluate(self, symbol: str, candles: list[dict[str, Any]]) -> Signal | None:
        if len(candles) < self.window + 2:
            return None
        vwaps = ind.vwap(candles, rolling=self.window)
        vwap_now = ind.latest(vwaps)
        last = candles[-1]["close"]
        if not vwap_now:
            return None
        dev_pct = (last - vwap_now) / vwap_now * 100
        if dev_pct >= self.threshold_pct:
            return Signal(
                self.name, symbol, "SHORT",
                f"{dev_pct:+.1f}% above VWAP → revert",
                last,
                stop_loss=round(last * 1.01, 6),
                take_profit=round(vwap_now, 6),
            )
        if dev_pct <= -self.threshold_pct:
            return Signal(
                self.name, symbol, "LONG",
                f"{dev_pct:+.1f}% below VWAP → revert",
                last,
                stop_loss=round(last * 0.99, 6),
                take_profit=round(vwap_now, 6),
            )
        return None


# --------------------------------------------------------------------- #
# Registry & signal store                                                #
# --------------------------------------------------------------------- #

STRATEGIES: dict[str, Strategy] = {
    s.name: s
    for s in [
        RSIMeanReversion(),
        MACross(),
        TrendPullback(),
        BollingerBreakout(),
        VWAPReversion(),
    ]
}

# In-memory ring buffer of recent signals (DB persistence comes later).
SIGNALS: list[dict[str, Any]] = []
MAX_SIGNALS = 500


def record_signal(sig: Signal) -> dict[str, Any]:
    entry = sig.to_dict()
    # Persist to SQLite (best-effort; in-memory list is the fallback).
    try:
        from app.db import save_signal

        entry = save_signal(entry)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Signal persistence failed: %s", exc)
    SIGNALS.insert(0, entry)
    del SIGNALS[MAX_SIGNALS:]
    return entry


def record_external_signal(payload: dict[str, Any]) -> dict[str, Any]:
    """Accept a signal from an external bot via webhook."""
    sig = Signal(
        strategy=str(payload.get("strategy", "external")),
        symbol=str(payload.get("symbol", "")).upper(),
        side=str(payload.get("side", "")).upper(),
        reason=str(payload.get("reason", "")),
        price=float(payload.get("price", 0)),
    )
    return record_signal(sig)


async def run_scan_once(symbols: list[str], interval: str = "15m") -> list[dict[str, Any]]:
    """Evaluate every registered strategy against every symbol once."""
    from app.adapters import get_market_adapter

    adapter = get_market_adapter()
    new_signals: list[dict[str, Any]] = []
    for symbol in symbols:
        try:
            candles = await adapter.klines(symbol, interval, 100)
        except Exception:  # noqa: BLE001 — skip symbols that fail
            continue
        for strat in STRATEGIES.values():
            try:
                sig = strat.evaluate(symbol, candles)
            except Exception:  # noqa: BLE001
                continue
            if sig is not None:
                new_signals.append(record_signal(sig))
    return new_signals