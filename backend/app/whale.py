"""Smart money radar — track whale footprints from public data.

Three signals, all keyless:
1. Whale prints   — individual fills above a notional threshold
2. CVD            — cumulative taker buy vs sell delta (aggression)
3. Book walls     — order-book levels far larger than typical depth
"""
from __future__ import annotations

import logging
import statistics
import time
from typing import Any

from app.adapters import get_market_adapter

logger = logging.getLogger(__name__)

_cache: dict[str, tuple[float, dict[str, Any]]] = {}


async def smart_money(
    symbol: str,
    min_notional_usd: float = 50_000,
    wall_sigma: float = 4.0,
) -> dict[str, Any]:
    """Aggregate whale signals for one symbol."""
    symbol = symbol.upper()
    now = time.time()
    hit = _cache.get(symbol)
    if hit and now - hit[0] < 10:  # 10s cache
        return hit[1]

    adapter = get_market_adapter()

    # --- 1. Whale prints from recent trades --------------------------- #
    try:
        trades = await adapter.recent_trades(symbol, 500)
        sized = [
            {**t, "notional": t["price"] * t["qty"]}
            for t in trades
        ]
        whales = sorted(
            (t for t in sized if t["notional"] >= min_notional_usd),
            key=lambda t: t["time"],
            reverse=True,
        )[:15]
        # Buy aggression among whales: buyer is taker when NOT buyer_maker.
        whale_buy_notional = sum(
            t["notional"] for t in whales if not t["is_buyer_maker"]
        )
        whale_sell_notional = sum(
            t["notional"] for t in whales if t["is_buyer_maker"]
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("whale trades failed: %s", exc)
        whales, whale_buy_notional, whale_sell_notional = [], 0.0, 0.0

    # --- 2. CVD from klines taker volumes ----------------------------- #
    cvd_series: list[dict[str, float]] = []
    try:
        import httpx

        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.get(
                "https://fapi.binance.com/fapi/v1/klines",
                params={"symbol": symbol, "interval": "5m", "limit": 48},
            )
            rows = resp.json()
        cvd = 0.0
        for r in rows[-24:]:
            vol = float(r[5])
            taker_buy = float(r[9])
            delta = taker_buy - (vol - taker_buy)  # buy - sell
            cvd += delta
            cvd_series.append({"ts": int(r[0]) // 1000, "cvd": round(cvd, 1)})
    except Exception as exc:  # noqa: BLE001
        logger.warning("cvd failed: %s", exc)

    cvd_trend = None
    if len(cvd_series) >= 2:
        diff = cvd_series[-1]["cvd"] - cvd_series[-6]["cvd"] if len(cvd_series) >= 6 else (
            cvd_series[-1]["cvd"] - cvd_series[0]["cvd"]
        )
        cvd_trend = "accumulation" if diff > 0 else "distribution"

    # --- 3. Order book walls ------------------------------------------ #
    walls: list[dict[str, Any]] = []
    try:
        ob = await adapter.order_book(symbol, 100)
        bid_qtys = [q for _, q in ob["bids"]]
        ask_qtys = [q for _, q in ob["asks"]]
        all_qtys = bid_qtys + ask_qtys
        if len(all_qtys) >= 20:
            mean = statistics.mean(all_qtys)
            std = statistics.pstdev(all_qtys) or 1e-12
            for side, levels in (("bid", ob["bids"]), ("ask", ob["asks"])):
                for price, qty in levels:
                    z = (qty - mean) / std
                    if z >= wall_sigma:
                        walls.append(
                            {
                                "side": side,
                                "price": price,
                                "qty": qty,
                                "notional": price * qty,
                                "z": round(z, 1),
                            }
                        )
        walls.sort(key=lambda w: w["notional"], reverse=True)
        walls = walls[:6]
    except Exception as exc:  # noqa: BLE001
        logger.warning("walls failed: %s", exc)

    result = {
        "symbol": symbol,
        "min_notional": min_notional_usd,
        "whales": [
            {
                "price": t["price"],
                "qty": t["qty"],
                "notional": round(t["notional"], 0),
                "side": "BUY" if not t["is_buyer_maker"] else "SELL",
                "time": t["time"],
            }
            for t in whales
        ],
        "whale_net_flow": round(whale_buy_notional - whale_sell_notional, 0),
        "cvd_series": cvd_series,
        "cvd_trend": cvd_trend,
        "walls": walls,
    }
    _cache[symbol] = (now, result)
    return result