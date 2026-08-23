"""Volume profile — volume distribution by price level.

Computes per-price-bucket volume over the lookback window, identifies
the POC (Point of Control — highest-volume price) and the Value Area
(70% of volume centered on POC). Classic auction-market theory levels.
"""
from __future__ import annotations

import time
from typing import Any

from app.adapters import get_market_adapter

_cache: dict[tuple[str, str], tuple[float, dict[str, Any]]] = {}

ROWS = 30


async def volume_profile(symbol: str, interval: str = "15m", limit: int = 200) -> dict[str, Any]:
    symbol = symbol.upper()
    now = time.time()
    key = (symbol, interval)
    hit = _cache.get(key)
    if hit and now - hit[0] < 60:
        return hit[1]

    adapter = get_market_adapter()
    candles = await adapter.klines(symbol, interval, limit)
    if len(candles) < 20:
        return {"symbol": symbol, "rows": [], "poc": None}

    p_min = min(c["low"] for c in candles)
    p_max = max(c["high"] for c in candles)
    span = (p_max - p_min) or p_min * 0.001
    row_h = span / ROWS

    # Distribute each candle's volume across rows its range touches.
    vols = [0.0] * ROWS
    for c in candles:
        lo_i = max(0, int((c["low"] - p_min) / row_h))
        hi_i = min(ROWS - 1, int((c["high"] - p_min) / row_h))
        n_rows = hi_i - lo_i + 1
        share = c["volume"] / n_rows
        for i in range(lo_i, hi_i + 1):
            vols[i] += share

    total = sum(vols)
    poc_idx = max(range(ROWS), key=lambda i: vols[i])

    # Value area: expand from POC until 70% of volume covered.
    target = total * 0.7
    va_lo = va_hi = poc_idx
    covered = vols[poc_idx]
    while covered < target and (va_lo > 0 or va_hi < ROWS - 1):
        below = vols[va_lo - 1] if va_lo > 0 else -1
        above = vols[va_hi + 1] if va_hi < ROWS - 1 else -1
        if above >= below:
            va_hi += 1
            covered += max(above, 0)
        else:
            va_lo -= 1
            covered += max(below, 0)

    def price(i: int) -> float:
        return round(p_min + row_h * (i + 0.5), 4)

    result = {
        "symbol": symbol,
        "interval": interval,
        "candles": len(candles),
        "total_volume": round(total, 2),
        "poc": price(poc_idx),
        "value_area": [price(va_lo), price(va_hi)],
        "price_range": [round(p_min, 4), round(p_max, 4)],
        "rows": [
            {
                "price": price(i),
                "volume": round(vols[i], 2),
                "in_va": va_lo <= i <= va_hi,
                "is_poc": i == poc_idx,
            }
            for i in range(ROWS)
        ],
    }
    _cache[key] = (now, result)
    return result