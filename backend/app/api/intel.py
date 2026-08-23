"""Market intelligence domain — news, calendar, sentiment, smart money."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

router = APIRouter(tags=["intel"])


@router.get("/api/intel/news")
async def news(limit: int = Query(default=20, ge=1, le=50)) -> list[dict[str, Any]]:
    """Latest crypto headlines (CoinDesk + Cointelegraph RSS, cached 5m)."""
    from app.market_intel import fetch_news

    return await fetch_news(limit)


@router.get("/api/intel/calendar")
async def calendar(
    impact: str = Query(default="high", pattern="^(low|medium|high)$"),
) -> list[dict[str, Any]]:
    """This week's economic calendar (ForexFactory, cached 30m)."""
    from app.market_intel import fetch_calendar

    return await fetch_calendar(impact)


@router.get("/api/intel/fear-greed")
async def fear_greed() -> dict[str, Any]:
    """Crypto Fear & Greed Index (alternative.me, cached 10m)."""
    from app.market_intel import fetch_fear_greed

    return await fetch_fear_greed()


@router.get("/api/intel/smart-money")
async def smart_money(
    symbol: str,
    min_notional: float = Query(default=50000, ge=1000),
) -> dict[str, Any]:
    """Whale prints + CVD + order-book walls for one symbol."""
    from app.whale import smart_money

    return await smart_money(symbol, min_notional)