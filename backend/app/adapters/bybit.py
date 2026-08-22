"""Bybit v5 adapter (public market data).

Symbol format: BTCUSDT (canonical) ↔ BTCUSDT (Bybit linear perpetuals).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, AsyncIterator

import httpx

from app.adapters.base import MarketDataAdapter

logger = logging.getLogger(__name__)

REST_BASE = "https://api.bybit.com"

INTERVAL_MAP = {
    "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
    "1h": "60", "2h": "120", "4h": "240", "6h": "360", "8h": "480",
    "12h": "720", "1d": "D",
}


class BybitAdapter(MarketDataAdapter):
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(base_url=REST_BASE, timeout=15)

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = await self._client.get(path, params=params)
        resp.raise_for_status()
        body = resp.json()
        if body.get("retCode") != 0:
            raise RuntimeError(f"Bybit error {body.get('retCode')}: {body.get('retMsg')}")
        return body.get("result", {})

    async def ticker(self, symbol: str) -> dict[str, Any]:
        rows = (
            await self._get(
                "/v5/market/tickers", {"category": "linear", "symbol": symbol.upper()}
            )
        )["list"]
        return self._norm_ticker(rows[0])

    async def tickers(self) -> list[dict[str, Any]]:
        result = await self._get("/v5/market/tickers", {"category": "linear"})
        return [self._norm_ticker(r) for r in result["list"]]

    @staticmethod
    def _norm_ticker(r: dict[str, Any]) -> dict[str, Any]:
        return {
            "symbol": r["symbol"],
            "last_price": float(r["lastPrice"]),
            "change_pct": float(r["price24hPcnt"]) * 100,
            "high_24h": float(r["highPrice24h"]),
            "low_24h": float(r["lowPrice24h"]),
            "volume": float(r["volume24h"]),
            "quote_volume": float(r["turnover24h"]),
        }

    async def klines(
        self, symbol: str, interval: str, limit: int = 200
    ) -> list[dict[str, Any]]:
        iv = INTERVAL_MAP.get(interval, "15")
        result = await self._get(
            "/v5/market/kline",
            {
                "category": "linear",
                "symbol": symbol.upper(),
                "interval": iv,
                "limit": min(limit, 1000),
            },
        )
        # Bybit returns newest-first → reverse
        out = []
        for k in reversed(result["list"]):
            out.append(
                {
                    "time": int(k[0]) // 1000,
                    "open": float(k[1]),
                    "high": float(k[2]),
                    "low": float(k[3]),
                    "close": float(k[4]),
                    "volume": float(k[5]),
                }
            )
        return out

    async def order_book(self, symbol: str, limit: int = 20) -> dict[str, Any]:
        depth = min(limit, 200)
        result = await self._get(
            "/v5/market/orderbook",
            {"category": "linear", "symbol": symbol.upper(), "limit": depth},
        )
        return {
            "bids": [[float(p), float(q)] for p, q in result["b"][:limit]],
            "asks": [[float(p), float(q)] for p, q in result["a"][:limit]],
        }

    async def recent_trades(self, symbol: str, limit: int = 50) -> list[dict[str, Any]]:
        result = await self._get(
            "/v5/market/recent-trade",
            {"category": "linear", "symbol": symbol.upper(), "limit": min(limit, 1000)},
        )
        return [
            {
                "id": t["execId"],
                "price": float(t["price"]),
                "qty": float(t["size"]),
                "time": int(t["time"]),
                "is_buyer_maker": t["side"] == "Sell",
            }
            for t in result["list"]
        ]

    async def stream_tickers(self, symbols: list[str]) -> AsyncIterator[dict[str, Any]]:
        """Poll-based fallback stream."""
        while True:
            try:
                for sym in symbols:
                    try:
                        yield await self.ticker(sym)
                    except Exception:  # noqa: BLE001
                        continue
                await asyncio.sleep(2)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Bybit poll error (%s); retrying...", exc)
                await asyncio.sleep(5)

    async def close(self) -> None:
        await self._client.aclose()