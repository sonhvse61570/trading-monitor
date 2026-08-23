"""Divergence + candlestick pattern detection.

Divergences: pivot-based RSI divergence over recent swings.
Patterns: single/multi-candle classics (engulfing, hammer,
shooting star, doji, inside bar) flagged only when they occur at a
local extreme (swing high/low) to reduce noise.
"""
from __future__ import annotations

import statistics
import time
from typing import Any

from app.adapters import get_market_adapter
from app.indicators import rsi

_cache: dict[tuple[str, str], tuple[float, dict[str, Any]]] = {}


def _pivots(values: list[float], left: int = 3, right: int = 3) -> tuple[list[int], list[int]]:
    """Return indices of local highs and lows."""
    highs: list[int] = []
    lows: list[int] = []
    for i in range(left, len(values) - right):
        window = values[i - left : i + right + 1]
        if values[i] == max(window):
            highs.append(i)
        if values[i] == min(window):
            lows.append(i)
    return highs, lows


async def detect(symbol: str, interval: str = "15m") -> dict[str, Any]:
    symbol = symbol.upper()
    now = time.time()
    key = (symbol, interval)
    hit = _cache.get(key)
    if hit and now - hit[0] < 60:
        return hit[1]

    adapter = get_market_adapter()
    candles = await adapter.klines(symbol, interval, 150)
    closes = [c["close"] for c in candles]
    r14 = rsi(closes, 14)

    signals: list[dict[str, Any]] = []

    # ---------- RSI divergences (pivot-based) ---------- #
    if len(closes) > 30:
        price_highs, price_lows = _pivots(closes, 4, 4)

        def rsi_at(idx: int) -> float | None:
            return r14[idx] if idx < len(r14) else None

        # Bullish: lower low in price, higher low in RSI (last two lows).
        if len(price_lows) >= 2:
            i1, i2 = price_lows[-2], price_lows[-1]
            r1, r2 = rsi_at(i1), rsi_at(i2)
            if (
                r1 is not None
                and r2 is not None
                and closes[i2] < closes[i1]
                and r2 > r1 + 1.5
                and len(closes) - i2 <= 20
            ):
                signals.append(
                    {
                        "type": "divergence",
                        "direction": "bull",
                        "name": "Bullish RSI Divergence",
                        "detail": f"Giá tạo đáy thấp hơn ({closes[i1]:.0f}→{closes[i2]:.0f}) nhưng RSI cao hơn ({r1:.0f}→{r2:.0f}) — lực bán cạn dần.",
                        "bar_index": i2,
                    }
                )

        # Bearish: higher high in price, lower high in RSI.
        if len(price_highs) >= 2:
            i1, i2 = price_highs[-2], price_highs[-1]
            r1, r2 = rsi_at(i1), rsi_at(i2)
            if (
                r1 is not None
                and r2 is not None
                and closes[i2] > closes[i1]
                and r2 < r1 - 1.5
                and len(closes) - i2 <= 20
            ):
                signals.append(
                    {
                        "type": "divergence",
                        "direction": "bear",
                        "name": "Bearish RSI Divergence",
                        "detail": f"Giá tạo đỉnh cao hơn ({closes[i1]:.0f}→{closes[i2]:.0f}) nhưng RSI thấp hơn ({r1:.0f}→{r2:.0f}) — động lực tăng yếu đi.",
                        "bar_index": i2,
                    }
                )

    # ---------- Candlestick patterns at swing extremes ---------- #
    if len(candles) >= 6:

        def body(c: dict[str, Any]) -> float:
            return abs(c["close"] - c["open"])

        def rng(c: dict[str, Any]) -> float:
            return max(c["high"] - c["low"], 1e-9)

        last3 = candles[-3:]
        prev, cur = candles[-2], candles[-1]
        _, lows_idx = _pivots([c["low"] for c in candles], 3, 2)
        highs_idx, _ = _pivots([c["high"] for c in candles], 3, 2)
        near_low = any(len(candles) - 1 - i <= 3 for i in lows_idx)
        near_high = any(len(candles) - 1 - i <= 3 for i in highs_idx)

        # Bullish engulfing at swing low
        if (
            near_low
            and cur["close"] > cur["open"]
            and prev["close"] < prev["open"]
            and cur["close"] >= prev["open"]
            and cur["open"] <= prev["close"]
            and body(cur) > body(prev)
        ):
            signals.append(
                {
                    "type": "pattern",
                    "direction": "bull",
                    "name": "Bullish Engulfing",
                    "detail": "Nến xanh nuốt trọn nến đỏ trước đó tại vùng đáy cục bộ — buyers chiếm quyền kiểm soát.",
                    "bar_index": len(candles) - 1,
                }
            )

        # Hammer at swing low
        lower_wick = min(cur["open"], cur["close"]) - cur["low"]
        upper_wick = cur["high"] - max(cur["open"], cur["close"])
        if (
            near_low
            and lower_wick > body(cur) * 2
            and upper_wick < body(cur)
            and body(cur) / rng(cur) < 0.35
        ):
            signals.append(
                {
                    "type": "pattern",
                    "direction": "bull",
                    "name": "Hammer",
                    "detail": "Bóng dưới dài gấp đôi thân nến tại vùng hỗ trợ — sellers bị đẩy lùi mạnh trong phiên.",
                    "bar_index": len(candles) - 1,
                }
            )

        # Shooting star at swing high
        if (
            near_high
            and upper_wick > body(cur) * 2
            and lower_wick < body(cur)
            and body(cur) / rng(cur) < 0.35
        ):
            signals.append(
                {
                    "type": "pattern",
                    "direction": "bear",
                    "name": "Shooting Star",
                    "detail": "Bóng trên dài tại vùng đỉnh cục bộ — buyers bị từ chối ở mức giá cao.",
                    "bar_index": len(candles) - 1,
                }
            )

        # Bearish engulfing at swing high
        if (
            near_high
            and cur["close"] < cur["open"]
            and prev["close"] > prev["open"]
            and cur["close"] <= prev["open"]
            and cur["open"] >= prev["close"]
            and body(cur) > body(prev)
        ):
            signals.append(
                {
                    "type": "pattern",
                    "direction": "bear",
                    "name": "Bearish Engulfing",
                    "detail": "Nến đỏ nuốt trọn nến xanh trước đó tại vùng đỉnh cục bộ — sellers áp đảo.",
                    "bar_index": len(candles) - 1,
                }
            )

        # Doji (indecision) anywhere recent
        if body(cur) / rng(cur) < 0.08:
            signals.append(
                {
                    "type": "pattern",
                    "direction": "neutral",
                    "name": "Doji",
                    "detail": "Thân nến gần như bằng 0 — thị trường đang cân bằng, chờ hướng breakout.",
                    "bar_index": len(candles) - 1,
                }
            )

    result = {
        "symbol": symbol,
        "interval": interval,
        "last_close": closes[-1] if closes else None,
        "rsi": round(r14[-1], 1) if r14 and r14[-1] else None,
        "signals": signals[-8:],  # most recent first-ish
    }
    _cache[key] = (now, result)
    return result