"""Smart support/resistance zones — clustered swing extremes.

Algorithm:
1. Find swing highs/lows (fractal pivots).
2. Cluster nearby pivots into zones (within 0.35 × ATR).
3. Score each zone: touches (40) + volume traded there (30)
   + recency of last touch (20) + wick rejections (10).
4. Classify as support (below price) or resistance (above).
"""
from __future__ import annotations

import statistics
import time
from typing import Any

from app.adapters import get_market_adapter

_cache: dict[tuple[str, str], tuple[float, dict[str, Any]]] = {}


async def detect_zones(symbol: str, interval: str = "1h") -> dict[str, Any]:
    symbol = symbol.upper()
    now = time.time()
    key = (symbol, interval)
    hit = _cache.get(key)
    if hit and now - hit[0] < 120:
        return hit[1]

    adapter = get_market_adapter()
    candles = await adapter.klines(symbol, interval, 300)
    if len(candles) < 60:
        return {"symbol": symbol, "zones": []}

    closes = [c["close"] for c in candles]
    last = closes[-1]

    # ATR for clustering tolerance.
    trs = []
    for i in range(1, len(candles)):
        c, pc = candles[i], candles[i - 1]["close"]
        trs.append(max(c["high"] - c["low"], abs(c["high"] - pc), abs(c["low"] - pc)))
    atr = statistics.mean(trs[-14:])
    tol = atr * 0.6

    # --- Swing pivots (fractal, 5-bar window) --- #
    pivots: list[dict[str, Any]] = []
    for i in range(5, len(candles) - 5):
        win_h = [c["high"] for c in candles[i - 5 : i + 6]]
        win_l = [c["low"] for c in candles[i - 5 : i + 6]]
        if candles[i]["high"] == max(win_h):
            pivots.append({"price": candles[i]["high"], "idx": i, "kind": "high"})
        if candles[i]["low"] == min(win_l):
            pivots.append({"price": candles[i]["low"], "idx": i, "kind": "low"})

    # --- Cluster into zones --- #
    clusters: list[list[dict[str, Any]]] = []
    for p in sorted(pivots, key=lambda x: x["price"]):
        placed = False
        for cl in clusters:
            mid = sum(x["price"] for x in cl) / len(cl)
            if abs(p["price"] - mid) <= tol:
                cl.append(p)
                placed = True
                break
        if not placed:
            clusters.append([p])

    # --- Score zones --- #
    total_vol = sum(c["volume"] for c in candles)
    zones: list[dict[str, Any]] = []
    for cl in clusters:
        if len(cl) < 2:
            continue  # single-touch levels are noise
        prices = [x["price"] for x in cl]
        lo, hi = min(prices), max(prices)
        mid = (lo + hi) / 2

        touches = len(cl)
        last_idx = max(x["idx"] for x in cl)
        recency = max(0.0, 1 - (len(candles) - last_idx) / len(candles))

        # Volume traded inside the zone band.
        vol_in = sum(
            c["volume"]
            for c in candles
            if c["low"] <= hi and c["high"] >= lo
        )
        vol_share = vol_in / (total_vol or 1)

        # Wick rejections: candles whose wick pierced but closed outside.
        rejects = sum(
            1
            for c in candles
            if (c["low"] < lo and c["close"] > hi)
            or (c["high"] > hi and c["close"] < lo)
        )

        score = round(
            min(40, touches * 8)
            + min(30, vol_share * 150)
            + recency * 20
            + min(10, rejects * 3),
            1,
        )

        zones.append(
            {
                "price_lo": round(lo, 4),
                "price_hi": round(hi, 4),
                "mid": round(mid, 4),
                "side": "support" if mid < last else "resistance",
                "touches": touches,
                "score": score,
                "last_touch_bars_ago": len(candles) - last_idx,
                "volume_share_pct": round(vol_share * 100, 1),
                "rejections": rejects,
            }
        )

    zones.sort(key=lambda z: abs(z["mid"] - last))
    result = {
        "symbol": symbol,
        "interval": interval,
        "last_price": last,
        "atr": round(atr, 4),
        "zones": zones[:14],
    }
    _cache[key] = (now, result)
    return result