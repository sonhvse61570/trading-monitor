"""Market scanner — ranks the market by momentum / volume / volatility."""
from __future__ import annotations

from typing import Any

from app.adapters import get_market_adapter


async def scan(venue: str = "binance") -> dict[str, Any]:
    adapter = get_market_adapter(venue)
    tickers = await adapter.tickers()
    usdt = [t for t in tickers if t["symbol"].endswith("USDT")]

    by_volume = sorted(usdt, key=lambda t: t["quote_volume"], reverse=True)
    gainers = sorted(usdt, key=lambda t: t["change_pct"], reverse=True)[:10]
    losers = sorted(usdt, key=lambda t: t["change_pct"])[:10]
    movers = sorted(
        usdt, key=lambda t: abs(t["change_pct"]), reverse=True
    )[:10]

    return {
        "gainers": _slim(gainers),
        "losers": _slim(losers),
        "movers": _slim(movers),
        "top_volume": _slim(by_volume[:10]),
        "total_symbols": len(usdt),
    }


def _slim(tickers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "symbol": t["symbol"],
            "last_price": t["last_price"],
            "change_pct": t["change_pct"],
            "quote_volume": t["quote_volume"],
            "high_24h": t["high_24h"],
            "low_24h": t["low_24h"],
        }
        for t in tickers
    ]