"""Derivatives positioning data — open interest & long/short ratios.

All from Binance Futures public endpoints (keyless):
- Open interest now + 24h history trend
- Global long/short account ratio
- Top-trader long/short position ratio (smart money proxy)
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE = "https://fapi.binance.com"
_cache: dict[str, tuple[float, dict[str, Any]]] = {}


async def positioning(symbol: str) -> dict[str, Any]:
    symbol = symbol.upper()
    now = time.time()
    hit = _cache.get(symbol)
    if hit and now - hit[0] < 60:
        return hit[1]

    async with httpx.AsyncClient(timeout=12) as client:
        # Current open interest
        oi_now = None
        try:
            r = await client.get(
                f"{BASE}/fapi/v1/openInterest",
                params={"symbol": symbol},
            )
            oi_now = float(r.json()["openInterest"])
        except Exception as exc:  # noqa: BLE001
            logger.warning("openInterest failed: %s", exc)

        # OI history (5m buckets, last 24h → 288 points; use 1h granularity)
        oi_series: list[dict[str, Any]] = []
        try:
            r = await client.get(
                f"{BASE}/futures/data/openInterestHist",
                params={"symbol": symbol, "period": "1h", "limit": 24},
            )
            rows = r.json()
            if isinstance(rows, list):
                oi_series = [
                    {
                        "ts": int(x["timestamp"]) // 1000,
                        "oi": float(x["sumOpenInterest"]),
                        "oi_usd": float(x["sumOpenInterestValue"]),
                    }
                    for x in rows
                ]
        except Exception as exc:  # noqa: BLE001
            logger.warning("oiHist failed: %s", exc)

        # Global long/short account ratio
        ls_global = None
        try:
            r = await client.get(
                f"{BASE}/futures/data/globalLongShortAccountRatio",
                params={"symbol": symbol, "period": "1h", "limit": 1},
            )
            rows = r.json()
            if isinstance(rows, list) and rows:
                ls_global = {
                    "ratio": float(rows[0]["longShortRatio"]),
                    "long_pct": float(rows[0]["longAccount"]) * 100,
                    "short_pct": float(rows[0]["shortAccount"]) * 100,
                }
        except Exception as exc:  # noqa: BLE001
            logger.warning("globalLS failed: %s", exc)

        # Top trader position ratio (whale positioning)
        ls_top = None
        try:
            r = await client.get(
                f"{BASE}/futures/data/topLongShortPositionRatio",
                params={"symbol": symbol, "period": "1h", "limit": 1},
            )
            rows = r.json()
            if isinstance(rows, list) and rows:
                ls_top = {
                    "ratio": float(rows[0]["longShortRatio"]),
                    "long_pct": float(rows[0]["longAccount"]) * 100,
                    "short_pct": float(rows[0]["shortAccount"]) * 100,
                }
        except Exception as exc:  # noqa: BLE001
            logger.warning("topLS failed: %s", exc)

    # OI trend over available series
    oi_change_pct = None
    if len(oi_series) >= 2:
        first, last = oi_series[0]["oi"], oi_series[-1]["oi"]
        if first > 0:
            oi_change_pct = round((last - first) / first * 100, 2)

    result = {
        "symbol": symbol,
        "open_interest": oi_now,
        "oi_change_24h_pct": oi_change_pct,
        "oi_series": oi_series,
        "ls_global": ls_global,
        "ls_top_traders": ls_top,
    }
    _cache[symbol] = (now, result)
    return result