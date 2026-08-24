"""Screener domain — market-wide opportunity scanning with rich metrics."""
from __future__ import annotations

import asyncio
import statistics
import time
from typing import Any

from fastapi import APIRouter, Query

router = APIRouter(tags=["screener"])

_cache: tuple[float, list[dict[str, Any]]] | None = None


_cache: tuple[float, list[dict[str, Any]], str] | None = None


async def _enrich(
    sym: str, ticker: dict[str, Any], tf: str = "15m"
) -> dict[str, Any] | None:
    """Compute full metric set for one symbol on the chosen timeframe."""
    from app.adapters import get_market_adapter
    from app.indicators import ema, latest, rsi
    from app.score import confluence_score

    adapter = get_market_adapter()
    try:
        c = await confluence_score(sym)
        candles = await adapter.klines(sym, tf, 60)
        closes = [x["close"] for x in candles]

        r14 = latest(rsi(closes, 14))
        e20 = latest(ema(closes, 20))
        e50 = latest(ema(closes, 50))

        # ATR%
        trs = []
        for i in range(1, len(candles)):
            x, pc = candles[i], candles[i - 1]["close"]
            trs.append(max(x["high"] - x["low"], abs(x["high"] - pc), abs(x["low"] - pc)))
        atr_pct = (
            round(statistics.mean(trs[-14:]) / closes[-1] * 100, 2)
            if len(trs) >= 14
            else None
        )

        # Volume vs 20-bar average (relative volume).
        vols = [x["volume"] for x in candles]
        rel_vol = (
            round(vols[-1] / (statistics.mean(vols[-21:-1]) or 1), 2)
            if len(vols) > 21
            else None
        )

        # Funding rate + OI change (best-effort, non-fatal).
        funding = oi_chg = None
        try:
            import httpx

            async with httpx.AsyncClient(timeout=8) as client:
                fr = await client.get(
                    "https://fapi.binance.com/fapi/v1/premiumIndex",
                    params={"symbol": sym},
                )
                funding = float(fr.json()["lastFundingRate"]) * 100
                oh = await client.get(
                    "https://fapi.binance.com/futures/data/openInterestHist",
                    params={"symbol": sym, "period": "1h", "limit": 6},
                )
                rows = oh.json()
                if isinstance(rows, list) and len(rows) >= 2:
                    first, last_ = float(rows[0]["sumOpenInterest"]), float(rows[-1]["sumOpenInterest"])
                    if first > 0:
                        oi_chg = round((last_ - first) / first * 100, 2)
        except Exception:  # noqa: BLE001
            pass

        return {
            "symbol": sym,
            "price": ticker["last_price"],
            "change_pct": ticker["change_pct"],
            "quote_volume_m": round(ticker.get("quote_volume", 0) / 1e6, 1),
            "score": c["score"],
            "bias": c["bias"],
            "mtf": c.get("mtf_alignment"),
            "cvd": c.get("cvd"),
            "timeframe": tf,
            "rsi": round(r14, 1) if r14 else None,
            "trend_ema": (
                "up" if e20 and e50 and e20 > e50 else ("down" if e20 and e50 else None)
            ),
            "atr_pct": atr_pct,
            "rel_vol": rel_vol,
            "funding_pct": round(funding, 4) if funding is not None else None,
            "oi_change_6h_pct": oi_chg,
        }
    except Exception:  # noqa: BLE001
        return None


@router.get("/api/screener/accumulation")
async def accumulation(
    top: int = Query(default=15, ge=5, le=30),
    refresh: int = Query(default=0, ge=0, le=1),
    tf: str = Query(default="15m", pattern="^(5m|15m|1h|4h)$"),
) -> dict[str, Any]:
    """Coins whales may be quietly accumulating (Wyckoff signatures)."""
    from app.accumulation import scan_accumulation

    return await scan_accumulation(top, force=bool(refresh), tf=tf)


@router.get("/api/screener")
async def screener(
    top: int = Query(default=25, ge=5, le=40),
    tf: str = Query(default="15m", pattern="^(5m|15m|1h|4h)$"),
) -> dict[str, Any]:
    """Rich ranking of liquid symbols by confluence score."""
    global _cache
    now = time.time()
    if _cache and now - _cache[0] < 180 and _cache[2] == tf:
        return {"count": len(_cache[1]), "rows": _cache[1][:top]}

    from app.adapters import get_market_adapter

    adapter = get_market_adapter()
    try:
        tickers = await adapter.tickers()
    except Exception as exc:  # noqa: BLE001
        return {"count": 0, "rows": [], "error": str(exc)}

    candidates = [
        t for t in tickers
        if t["symbol"].endswith("USDT") and t.get("quote_volume", 0) > 30_000_000
    ]
    candidates.sort(key=lambda t: -t.get("quote_volume", 0))
    candidates = candidates[:top]

    results = await asyncio.gather(
        *(_enrich(t["symbol"], t, tf) for t in candidates)
    )
    rows = sorted(
        (r for r in results if r is not None),
        key=lambda r: abs(r["score"] - 50),
        reverse=True,
    )
    _cache = (now, rows, tf)
    return {"count": len(rows), "rows": rows, "timeframe": tf}
