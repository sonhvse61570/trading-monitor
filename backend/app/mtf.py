"""Multi-timeframe analysis + classic pivot points.

MTF: EMA(20)/EMA(50) + close position per timeframe → trend alignment
matrix. Pivots: standard floor-trader levels from yesterday's H/L/C.
"""
from __future__ import annotations

from typing import Any

from app.adapters import get_market_adapter
from app.indicators import ema, latest

TIMEFRAMES = ["5m", "15m", "1h", "4h"]


async def mtf_trend(symbol: str) -> dict[str, Any]:
    """Trend verdict per timeframe + overall alignment."""
    adapter = get_market_adapter()
    rows: list[dict[str, Any]] = []

    for tf in TIMEFRAMES:
        try:
            candles = await adapter.klines(symbol.upper(), tf, 60)
            closes = [c["close"] for c in candles]
            if len(closes) < 55:
                continue
            e20 = latest(ema(closes, 20))
            e50 = latest(ema(closes, 50))
            last = closes[-1]
            if e20 is None or e50 is None:
                continue
            # Score: close vs EMA20, EMA20 vs EMA50, EMA20 slope
            score = 0
            score += 1 if last > e20 else -1
            score += 1 if e20 > e50 else -1
            prev_e20 = latest(ema(closes[:-3], 20))
            if prev_e20 is not None:
                score += 1 if e20 > prev_e20 else -1
            verdict = "bull" if score >= 2 else ("bear" if score <= -2 else "flat")
            rows.append(
                {
                    "tf": tf,
                    "verdict": verdict,
                    "close": round(last, 4),
                    "ema20": round(e20, 4),
                    "ema50": round(e50, 4),
                }
            )
        except Exception:  # noqa: BLE001 — skip failed TFs
            continue

    bulls = sum(1 for r in rows if r["verdict"] == "bull")
    bears = sum(1 for r in rows if r["verdict"] == "bear")
    if rows and bulls == len(rows):
        alignment = "STRONG_BULL"
    elif rows and bears == len(rows):
        alignment = "STRONG_BEAR"
    elif bulls > bears and bulls >= 3:
        alignment = "BULL_BIAS"
    elif bears > bulls and bears >= 3:
        alignment = "BEAR_BIAS"
    else:
        alignment = "MIXED"

    return {"symbol": symbol.upper(), "timeframes": rows, "alignment": alignment}


async def pivot_points(symbol: str) -> dict[str, Any]:
    """Classic floor-trader pivots from the most recent completed daily candle."""
    adapter = get_market_adapter()
    daily = await adapter.klines(symbol.upper(), "1d", 3)
    if len(daily) < 2:
        return {}

    prev = daily[-2]  # last completed day
    high, low, close = prev["high"], prev["low"], prev["close"]
    p = (high + low + close) / 3

    def lvl(price: float) -> float:
        return round(price, 6)

    return {
        "symbol": symbol.upper(),
        "prev_high": high,
        "prev_low": low,
        "prev_close": close,
        "p": lvl(p),
        "r1": lvl(2 * p - low),
        "r2": lvl(p + (high - low)),
        "r3": lvl(high + 2 * (p - low)),
        "s1": lvl(2 * p - high),
        "s2": lvl(p - (high - low)),
        "s3": lvl(low - 2 * (high - p)),
    }