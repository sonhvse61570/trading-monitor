"""Technical indicators — pure Python, no external deps.

All functions accept plain lists of floats (or candle dicts) and return
lists aligned to the input length (NaN-free: None where undefined).
"""
from __future__ import annotations

from typing import Any


def sma(values: list[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if period <= 0:
        return out
    running = 0.0
    for i, v in enumerate(values):
        running += v
        if i >= period:
            running -= values[i - period]
        if i >= period - 1:
            out[i] = running / period
    return out


def ema(values: list[float], period: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if period <= 0 or len(values) < period:
        return out
    k = 2 / (period + 1)
    prev = sum(values[:period]) / period
    out[period - 1] = prev
    for i in range(period, len(values)):
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def rsi(values: list[float], period: int = 14) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if len(values) <= period:
        return out
    gains = losses = 0.0
    for i in range(1, period + 1):
        diff = values[i] - values[i - 1]
        gains += max(diff, 0)
        losses += max(-diff, 0)
    avg_gain = gains / period
    avg_loss = losses / period
    out[period] = _rsi_value(avg_gain, avg_loss)
    for i in range(period + 1, len(values)):
        diff = values[i] - values[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(diff, 0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-diff, 0)) / period
        out[i] = _rsi_value(avg_gain, avg_loss)
    return out


def _rsi_value(avg_gain: float, avg_loss: float) -> float:
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def macd(
    values: list[float], fast: int = 12, slow: int = 26, signal: int = 9
) -> dict[str, list[float | None]]:
    ema_fast = ema(values, fast)
    ema_slow = ema(values, slow)
    macd_line: list[float | None] = [
        (f - s) if f is not None and s is not None else None
        for f, s in zip(ema_fast, ema_slow)
    ]
    # EMA of the defined portion of macd_line
    defined = [m for m in macd_line if m is not None]
    signal_defined = ema(defined, signal) if len(defined) >= signal else []
    signal_line: list[float | None] = [None] * len(values)
    offset = len(values) - len(defined)
    for i, s in enumerate(signal_defined):
        if s is not None:
            signal_line[offset + i] = s
    hist = [
        (m - s) if m is not None and s is not None else None
        for m, s in zip(macd_line, signal_line)
    ]
    return {"macd": macd_line, "signal": signal_line, "hist": hist}


def bollinger(
    values: list[float], period: int = 20, num_std: float = 2.0
) -> dict[str, list[float | None]]:
    mid = sma(values, period)
    upper: list[float | None] = [None] * len(values)
    lower: list[float | None] = [None] * len(values)
    for i in range(period - 1, len(values)):
        m = mid[i]
        if m is None:
            continue
        window = values[i - period + 1 : i + 1]
        variance = sum((v - m) ** 2 for v in window) / period
        sd = variance ** 0.5
        upper[i] = m + num_std * sd
        lower[i] = m - num_std * sd
    return {"mid": mid, "upper": upper, "lower": lower}


def vwap(candles: list[dict[str, Any]], rolling: int | None = None) -> list[float | None]:
    """VWAP over candle dicts with keys high/low/close/volume.

    rolling=None → anchored from first candle; rolling=N → N-candle rolling VWAP.
    """
    out: list[float | None] = [None] * len(candles)
    cum_pv = cum_v = 0.0
    window: list[tuple[float, float]] = []
    for i, c in enumerate(candles):
        typical = (c["high"] + c["low"] + c["close"]) / 3
        vol = c["volume"] or 0.0
        pv = typical * vol
        if rolling is None:
            cum_pv += pv
            cum_v += vol
            out[i] = cum_pv / cum_v if cum_v > 0 else None
        else:
            window.append((pv, vol))
            if len(window) > rolling:
                old_pv, old_v = window.pop(0)
                cum_pv -= old_pv
                cum_v -= old_v
            cum_pv = sum(p for p, _ in window)
            cum_v = sum(v for _, v in window)
            out[i] = cum_pv / cum_v if cum_v > 0 else None
    return out


def latest(values: list[float | None]) -> float | None:
    for v in reversed(values):
        if v is not None:
            return v
    return None