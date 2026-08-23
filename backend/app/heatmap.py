"""Whale footprint heatmap — price × time matrix of large fills.

Aggregates recent trades into a 2D grid: price buckets (rows) ×
time buckets (columns). Each cell holds buy/sell notional so the UI
can render green/red heat where whales actually transacted.
"""
from __future__ import annotations

import time
from typing import Any

from app.adapters import get_market_adapter

_cache: dict[tuple[str, float], tuple[float, dict[str, Any]]] = {}

PRICE_ROWS = 28
TIME_COLS = 24


async def whale_heatmap(
    symbol: str,
    min_notional_usd: float = 25_000,
) -> dict[str, Any]:
    symbol = symbol.upper()
    now = time.time()
    key = (symbol, min_notional_usd)
    hit = _cache.get(key)
    if hit and now - hit[0] < 15:
        return hit[1]

    adapter = get_market_adapter()
    trades = await adapter.recent_trades(symbol, 1000)

    sized = [
        {
            "price": t["price"],
            "qty": t["qty"],
            "notional": t["price"] * t["qty"],
            "buy": t.get("is_buyer_maker") is False,
            "time": t["time"] // 1000,
        }
        for t in trades
        if t["price"] * t["qty"] >= min_notional_usd
    ]

    if not sized:
        result = {
            "symbol": symbol,
            "min_notional": min_notional_usd,
            "rows": PRICE_ROWS,
            "cols": TIME_COLS,
            "price_min": None,
            "price_max": None,
            "t_start": None,
            "t_end": None,
            "cells": [],
        }
        _cache[key] = (now, result)
        return result

    t_min = min(t["time"] for t in sized)
    t_max = max(t["time"] for t in sized)
    p_min = min(t["price"] for t in sized)
    p_max = max(t["price"] for t in sized)

    p_span = (p_max - p_min) or p_min * 0.001
    t_span = max((t_max - t_min), 1)

    def p_bucket(p: float) -> int:
        return min(PRICE_ROWS - 1, int((p - p_min) / p_span * PRICE_ROWS))

    def t_bucket(ts: float) -> int:
        return min(TIME_COLS - 1, int((ts - t_min) / t_span * TIME_COLS))

    # cells[(pr, tc)] = [buy_notional, sell_notional]
    cells: dict[tuple[int, int], list[float]] = {}
    for t in sized:
        k = (p_bucket(t["price"]), t_bucket(t["time"]))
        agg = cells.setdefault(k, [0.0, 0.0])
        agg[0 if t["buy"] else 1] += t["notional"]

    out_cells = [
        {
            "row": pr,
            "col": tc,
            "price_lo": round(p_min + p_span * pr / PRICE_ROWS, 4),
            "price_hi": round(p_min + p_span * (pr + 1) / PRICE_ROWS, 4),
            "buy": round(b, 0),
            "sell": round(s, 0),
            "total": round(b + s, 0),
        }
        for (pr, tc), (b, s) in sorted(cells.items())
    ]
    # Time bucket boundaries (ms) for axis labels.
    col_times = [
        {"col": c, "ts": t_min + t_span * c / TIME_COLS}
        for c in range(TIME_COLS)
    ]

    result = {
        "symbol": symbol,
        "min_notional": min_notional_usd,
        "rows": PRICE_ROWS,
        "cols": TIME_COLS,
        "price_min": p_min,
        "price_max": p_max,
        "t_start": t_min,
        "t_end": t_max,
        "col_times": col_times,
        "cells": out_cells,
    }
    _cache[key] = (now, result)
    return result