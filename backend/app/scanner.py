"""Market scanner — ranks the market by momentum / volume / volatility."""
from __future__ import annotations

from typing import Any

from app.adapters import get_market_adapter


async def scan(venue: str = "binance") -> dict[str, Any]:
    adapter = get_market_adapter(venue)
    tickers = await adapter.tickers()
    usdt = [t for t in tickers if t["symbol"].endswith("USDT")]

    # Attach funding rates when available (futures venues).
    funding: dict[str, float] = {}
    if venue == "binance":
        try:
            resp = await adapter._get("/fapi/v1/premiumIndex")
            funding = {
                r["symbol"]: float(r["lastFundingRate"]) * 100
                for r in resp
                if r.get("symbol", "").endswith("USDT")
            }
        except Exception:  # noqa: BLE001 — optional field
            pass

    by_volume = sorted(usdt, key=lambda t: t["quote_volume"], reverse=True)
    gainers = sorted(usdt, key=lambda t: t["change_pct"], reverse=True)[:10]
    losers = sorted(usdt, key=lambda t: t["change_pct"])[:10]
    movers = sorted(
        usdt, key=lambda t: abs(t["change_pct"]), reverse=True
    )[:10]

    return {
        "venue": venue,
        "gainers": _slim(gainers, funding),
        "losers": _slim(losers, funding),
        "movers": _slim(movers, funding),
        "top_volume": _slim(by_volume[:10], funding),
        "top_funding": sorted(
            (
                {"symbol": s, "funding_rate": round(r, 4)}
                for s, r in funding.items()
            ),
            key=lambda x: abs(x["funding_rate"]),
            reverse=True,
        )[:10],
        "total_symbols": len(usdt),
    }


def _slim(tickers: list[dict[str, Any]], funding: dict[str, float] | None = None) -> list[dict[str, Any]]:
    return [
        {
            "symbol": t["symbol"],
            "last_price": t["last_price"],
            "change_pct": t["change_pct"],
            "quote_volume": t["quote_volume"],
            "high_24h": t["high_24h"],
            "low_24h": t["low_24h"],
            "funding_rate": (
                round(funding[t["symbol"]], 4)
                if funding and t["symbol"] in funding
                else None
            ),
        }
        for t in tickers
    ]
