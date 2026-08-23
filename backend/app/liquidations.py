"""Estimated liquidation clusters + cross-symbol correlation.

Liquidation estimates: for each price bucket, sum notional of
positions that would be liquidated if price reaches it. We approximate
using recent large trades as position proxies (public-data heuristic —
real liq data needs exchange internals or Coinglass).

Correlation: Pearson r of hourly returns over the last N hours.
"""
from __future__ import annotations

import math
import time
from typing import Any

from app.adapters import get_market_adapter

_liq_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_corr_cache: tuple[float, dict[str, Any]] | None = None

LIQ_BUCKETS = 40


async def liquidation_clusters(symbol: str) -> dict[str, Any]:
    """Heuristic liquidation map from recent aggressive flow.

    Logic: big market buys near a price level imply leveraged longs
    opened there; their liquidation sits ~1-3% below (leverage guess).
    Mirrored for shorts. This is an estimate, clearly labelled.
    """
    symbol = symbol.upper()
    now = time.time()
    hit = _liq_cache.get(symbol)
    if hit and now - hit[0] < 60:
        return hit[1]

    adapter = get_market_adapter()
    trades = await adapter.recent_trades(symbol, 1000)
    if not trades:
        result = {"symbol": symbol, "buckets": [], "note": "no data"}
        _liq_cache[symbol] = (now, result)
        return result

    prices = [t["price"] for t in trades]
    p_min, p_max = min(prices), max(prices)
    span = p_max - p_min
    # Extend range to cover liquidation zones below/above.
    lo = p_min - span * 0.6
    hi = p_max + span * 0.6
    bucket_w = (hi - lo) / LIQ_BUCKETS

    # buckets[i] = {"long_usd": x, "short_usd": y}
    buckets: list[dict[str, float]] = [
        {"long_usd": 0.0, "short_usd": 0.0} for _ in range(LIQ_BUCKETS)
    ]

    def bidx(p: float) -> int:
        return max(0, min(LIQ_BUCKETS - 1, int((p - lo) / bucket_w)))

    for t in trades:
        notional = t["price"] * t["qty"]
        if notional < 20_000:  # only meaningful positions
            continue
        is_long_open = not t["is_buyer_maker"]
        # Assume avg 10x leverage → liq ~9% against entry.
        liq_price = (
            t["price"] * 0.91 if is_long_open else t["price"] * 1.09
        )
        b = bidx(liq_price)
        if is_long_open:
            buckets[b]["long_usd"] += notional
        else:
            buckets[b]["short_usd"] += notional

    out = [
        {
            "price_lo": round(lo + i * bucket_w, 2),
            "price_hi": round(lo + (i + 1) * bucket_w, 2),
            **{k: round(v) for k, v in bk.items()},
        }
        for i, bk in enumerate(buckets)
        if bk["long_usd"] > 0 or bk["short_usd"] > 0
    ]

    last = prices[-1]
    result = {
        "symbol": symbol,
        "last_price": last,
        "range": [round(lo, 2), round(hi, 2)],
        "buckets": out,
        "disclaimer": (
            "Ước lượng heuristic từ dòng tiền lớn (giả định đòn bẩy ~10x). "
            "Không phải dữ liệu thanh lý thực của sàn."
        ),
    }
    _liq_cache[symbol] = (now, result)
    return result


CORR_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]


async def correlation_matrix(hours: int = 48) -> dict[str, Any]:
    """Pearson correlation of hourly returns across major symbols."""
    global _corr_cache
    now = time.time()
    if _corr_cache and now - _corr_cache[0] < 300:
        return _corr_cache[1]

    adapter = get_market_adapter()
    series: dict[str, list[float]] = {}
    for sym in CORR_SYMBOLS:
        try:
            candles = await adapter.klines(sym, "1h", hours + 2)
            closes = [c["close"] for c in candles]
            rets = [
                (closes[i] - closes[i - 1]) / closes[i - 1]
                for i in range(1, len(closes))
            ]
            series[sym] = rets[-hours:]
        except Exception:  # noqa: BLE001
            continue

    syms = list(series.keys())
    n = len(syms)
    matrix: list[list[float | None]] = [[None] * n for _ in range(n)]

    def pearson(a: list[float], b: list[float]) -> float | None:
        m = min(len(a), len(b))
        if m < 10:
            return None
        a, b = a[:m], b[:m]
        ma, mb = sum(a) / m, sum(b) / m
        cov = sum((x - ma) * (y - mb) for x, y in zip(a, b))
        va = math.sqrt(sum((x - ma) ** 2 for x in a))
        vb = math.sqrt(sum((y - mb) ** 2 for y in b))
        if va == 0 or vb == 0:
            return None
        return round(cov / (va * vb), 3)

    for i in range(n):
        matrix[i][i] = 1.0
        for j in range(i + 1, n):
            r = pearson(series[syms[i]], series[syms[j]])
            matrix[i][j] = r
            matrix[j][i] = r

    result = {
        "symbols": syms,
        "matrix": matrix,
        "hours": hours,
        "updated_at": int(now),
    }
    _corr_cache = (now, result)
    return result