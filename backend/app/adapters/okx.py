"""OKX v5 adapter (public market data).

Symbol format: BTCUSDT (canonical) ↔ BTC-USDT-SWAP (OKX perpetuals).
Execution (private endpoints) can be added later following the same pattern.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, AsyncIterator

import httpx

from app.adapters.base import MarketDataAdapter

logger = logging.getLogger(__name__)

REST_BASE = "https://www.okx.com"

# Canonical interval -> OKX bar
INTERVAL_MAP = {
    "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1H", "2h": "2H", "4h": "4H", "6h": "6H", "8h": "8H",
    "12h": "12H", "1d": "1D",
}


def _to_okx_symbol(symbol: str) -> str:
    """BTCUSDT -> BTC-USDT-SWAP"""
    s = symbol.upper()
    if s.endswith("USDT"):
        return f"{s[:-4]}-USDT-SWAP"
    return f"{s}-USD-SWAP"


def _from_okx_symbol(inst_id: str) -> str:
    """BTC-USDT-SWAP -> BTCUSDT"""
    parts = inst_id.split("-")
    return f"{parts[0]}{parts[1]}"


class OkxAdapter(MarketDataAdapter):
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(base_url=REST_BASE, timeout=15)

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = await self._client.get(path, params=params)
        resp.raise_for_status()
        body = resp.json()
        if body.get("code") != "0":
            raise RuntimeError(f"OKX error {body.get('code')}: {body.get('msg')}")
        return body.get("data", [])

    async def ticker(self, symbol: str) -> dict[str, Any]:
        rows = await self._get(
            "/api/v5/market/ticker", {"instId": _to_okx_symbol(symbol)}
        )
        return self._norm_ticker(rows[0])

    async def tickers(self) -> list[dict[str, Any]]:
        rows = await self._get("/api/v5/market/tickers", {"instType": "SWAP"})
        return [
            self._norm_ticker(r)
            for r in rows
            if r["instId"].endswith("-USDT-SWAP")
        ]

    @staticmethod
    def _norm_ticker(r: dict[str, Any]) -> dict[str, Any]:
        last = float(r["last"])
        open_ = float(r.get("open24h") or 0)
        change_pct = ((last - open_) / open_ * 100) if open_ > 0 else 0.0
        return {
            "symbol": _from_okx_symbol(r["instId"]),
            "last_price": last,
            "change_pct": round(change_pct, 4),
            "high_24h": float(r.get("high24h") or 0),
            "low_24h": float(r.get("low24h") or 0),
            "volume": float(r.get("vol24h") or 0),
            "quote_volume": float(r.get("volCcy24h") or 0),
        }

    async def klines(
        self, symbol: str, interval: str, limit: int = 200
    ) -> list[dict[str, Any]]:
        bar = INTERVAL_MAP.get(interval, "15m")
        rows = await self._get(
            "/api/v5/market/candles",
            {"instId": _to_okx_symbol(symbol), "bar": bar, "limit": min(limit, 300)},
        )
        # OKX returns newest-first → reverse to oldest-first
        out = []
        for k in reversed(rows):
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
        sz = max(5, min(limit, 400))
        rows = await self._get(
            "/api/v5/market/books", {"instId": _to_okx_symbol(symbol), "sz": sz}
        )
        book = rows[0]
        return {
            "bids": [[float(p), float(q)] for p, q, *_ in book["bids"][:limit]],
            "asks": [[float(p), float(q)] for p, q, *_ in book["asks"][:limit]],
        }

    async def recent_trades(self, symbol: str, limit: int = 50) -> list[dict[str, Any]]:
        rows = await self._get(
            "/api/v5/market/trades",
            {"instId": _to_okx_symbol(symbol), "limit": min(limit, 100)},
        )
        return [
            {
                "id": t["tradeId"],
                "price": float(t["px"]),
                "qty": float(t["sz"]),
                "time": int(t["ts"]),
                "is_buyer_maker": t["side"] == "sell",
            }
            for t in rows
        ]

    async def stream_tickers(self, symbols: list[str]) -> AsyncIterator[dict[str, Any]]:
        """Poll-based fallback stream (OKX WS could be added similarly)."""
        while True:
            try:
                for sym in symbols:
                    try:
                        yield await self.ticker(sym)
                    except Exception:  # noqa: BLE001
                        continue
                await asyncio.sleep(2)
            except Exception as exc:  # noqa: BLE001
                logger.warning("OKX poll error (%s); retrying...", exc)
                await asyncio.sleep(5)

    async def close(self) -> None:
        await self._client.aclose()