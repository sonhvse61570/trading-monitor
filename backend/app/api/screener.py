"""Screener domain — market-wide opportunity scanning."""
from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import APIRouter, Query

router = APIRouter(tags=["screener"])

_cache: tuple[float, list[dict[str, Any]]] | None = None


@router.get("/api/screener")
async def screener(
    top: int = Query(default=20, ge=5, le=50),
) -> dict[str, Any]:
    """Rank liquid symbols by confluence score — find best setups market-wide."""
    global _cache
    now = time.time()
    if _cache and now - _cache[0] < 120:
        rows = _cache[1][:top]
        return {"count": len(rows), "rows": rows}

    from app.adapters import get_market_adapter
    from app.score import confluence_score

    adapter = get_market_adapter()
    try:
        tickers = await adapter.tickers()
    except Exception as exc:  # noqa: BLE001
        return {"count": 0, "rows": [], "error": str(exc)}

    # Liquid USDT perps only.
    candidates = [
        t["symbol"]
        for t in tickers
        if t["symbol"].endswith("USDT") and t.get("quote_volume", 0) > 20_000_000
    ]
    candidates.sort(key=lambda s: -next(
        t["quote_volume"] for t in tickers if t["symbol"] == s
    ))
    candidates = candidates[:top]

    async def one(sym: str) -> dict[str, Any] | None:
        try:
            c = await confluence_score(sym)
            tk = next(t for t in tickers if t["symbol"] == sym)
            return {
                "symbol": sym,
                "price": tk["last_price"],
                "change_pct": tk["change_pct"],
                "score": c["score"],
                "bias": c["bias"],
                "mtf": c.get("mtf_alignment"),
                "cvd": c.get("cvd"),
            }
        except Exception:  # noqa: BLE001
            return None

    results = await asyncio.gather(*(one(s) for s in candidates))
    rows = sorted(
        (r for r in results if r is not None),
        key=lambda r: abs(r["score"] - 50),
        reverse=True,
    )
    _cache = (now, rows)
    return {"count": len(rows), "rows": rows[:top]}