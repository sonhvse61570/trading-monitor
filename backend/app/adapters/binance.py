"""Binance USD-M Futures adapter.

Implements MarketDataAdapter + ExecutionAdapter against Binance Futures
REST API. Public endpoints need no auth; private endpoints are HMAC-signed.
"""
from __future__ import annotations

import asyncio
import contextlib
import hashlib
import hmac
import json
import logging
import ssl
import time
from typing import Any, AsyncIterator
from urllib.parse import urlencode

import httpx
import websockets

from app.config import settings
from app.adapters.base import ExecutionAdapter, MarketDataAdapter

logger = logging.getLogger(__name__)

REST_BASE = "https://fapi.binance.com"
# NOTE: some networks block data frames from fstream.binance.com (futures WS)
# while the spot WS works fine. Spot miniTicker prices track futures closely,
# so we use the spot stream for live tickers.
WS_BASE = "wss://stream.binance.com:9443/stream"


def _ws_ssl_context() -> ssl.SSLContext:
    """Unverified SSL context for the upstream WS.

    Some networks (corporate proxies / AV) re-sign TLS traffic, which breaks
    certificate verification. Public market data carries no secrets, so we
    accept the trade-off to stay connected.
    """
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


class BinanceFuturesAdapter(MarketDataAdapter, ExecutionAdapter):
    """One adapter for both market data and execution on Binance USD-M."""

    def __init__(self) -> None:
        self._client = httpx.AsyncClient(base_url=REST_BASE, timeout=15)
        # Cache exchange filters (tick size / step size) per symbol.
        self._filters: dict[str, dict[str, float]] = {}
        self._filters_lock = asyncio.Lock()

    # ------------------------------------------------------------------ #
    # Signing helpers                                                     #
    # ------------------------------------------------------------------ #

    def _signed_params(self, params: dict[str, Any] | None = None) -> dict[str, Any]:
        if not settings.binance_api_key:
            raise RuntimeError(
                "Binance API key not configured (set BINANCE_API_KEY in .env)"
            )
        merged = {"timestamp": int(time.time() * 1000), "recvWindow": 5000}
        if params:
            merged.update(params)
        query = urlencode(merged)
        signature = hmac.new(
            settings.binance_api_secret.encode(), query.encode(), hashlib.sha256
        ).hexdigest()
        merged["signature"] = signature
        return merged

    def _headers(self) -> dict[str, str]:
        return {"X-MBX-APIKEY": settings.binance_api_key}

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        resp = await self._client.get(path, params=params)
        resp.raise_for_status()
        return resp.json()

    async def _post(self, path: str, params: dict[str, Any]) -> Any:
        resp = await self._client.post(path, params=params, headers=self._headers())
        resp.raise_for_status()
        return resp.json()

    async def _delete(self, path: str, params: dict[str, Any]) -> Any:
        resp = await self._client.delete(path, params=params, headers=self._headers())
        resp.raise_for_status()
        return resp.json()

    # ------------------------------------------------------------------ #
    # Exchange info / symbol filters                                      #
    # ------------------------------------------------------------------ #

    async def _symbol_filters(self, symbol: str) -> dict[str, float]:
        async with self._filters_lock:
            if symbol not in self._filters:
                info = await self._get("/fapi/v1/exchangeInfo")
                for s in info.get("symbols", []):
                    f = {
                        flt["filterType"]: flt
                        for flt in s.get("filters", [])
                    }
                    tick = float(f.get("PRICE_FILTER", {}).get("tickSize", "0.001"))
                    step = float(f.get("LOT_SIZE", {}).get("stepSize", "0.001"))
                    min_qty = float(f.get("LOT_SIZE", {}).get("minQty", "0.001"))
                    self._filters[s["symbol"]] = {
                        "tick": tick,
                        "step": step,
                        "min_qty": min_qty,
                    }
            return self._filters[symbol]

    @staticmethod
    def _round_to(value: float, step: float) -> float:
        """Round value down to a multiple of step (exchange-safe)."""
        if step <= 0:
            return value
        precision = len(str(step).split(".")[-1].rstrip("0")) or 0
        return round(int(value / step) * step, precision)

    # ------------------------------------------------------------------ #
    # MarketDataAdapter                                                   #
    # ------------------------------------------------------------------ #

    async def ticker(self, symbol: str) -> dict[str, Any]:
        data = await self._get("/fapi/v1/ticker/24hr", {"symbol": symbol})
        return {
            "symbol": data["symbol"],
            "last_price": float(data["lastPrice"]),
            "change_pct": float(data["priceChangePercent"]),
            "high_24h": float(data["highPrice"]),
            "low_24h": float(data["lowPrice"]),
            "volume": float(data["volume"]),
            "quote_volume": float(data["quoteVolume"]),
        }

    async def tickers(self) -> list[dict[str, Any]]:
        data = await self._get("/fapi/v1/ticker/24hr")
        out = []
        for d in data:
            out.append(
                {
                    "symbol": d["symbol"],
                    "last_price": float(d["lastPrice"]),
                    "change_pct": float(d["priceChangePercent"]),
                    "high_24h": float(d["highPrice"]),
                    "low_24h": float(d["lowPrice"]),
                    "volume": float(d["volume"]),
                    "quote_volume": float(d["quoteVolume"]),
                }
            )
        return out

    async def klines(
        self, symbol: str, interval: str, limit: int = 200
    ) -> list[dict[str, Any]]:
        raw = await self._get(
            "/fapi/v1/klines",
            {"symbol": symbol, "interval": interval, "limit": limit},
        )
        return [
            {
                "time": k[0] // 1000,  # seconds — Lightweight Charts format
                "open": float(k[1]),
                "high": float(k[2]),
                "low": float(k[3]),
                "close": float(k[4]),
                "volume": float(k[5]),
            }
            for k in raw
        ]

    async def order_book(self, symbol: str, limit: int = 20) -> dict[str, Any]:
        data = await self._get("/fapi/v1/depth", {"symbol": symbol, "limit": limit})
        return {
            "bids": [[float(p), float(q)] for p, q in data["bids"]],
            "asks": [[float(p), float(q)] for p, q in data["asks"]],
        }

    async def recent_trades(self, symbol: str, limit: int = 50) -> list[dict[str, Any]]:
        data = await self._get("/fapi/v1/trades", {"symbol": symbol, "limit": limit})
        return [
            {
                "id": t["id"],
                "price": float(t["price"]),
                "qty": float(t["qty"]),
                "time": t["time"],
                "is_buyer_maker": t["isBuyerMaker"],
            }
            for t in data
        ]

    async def stream_tickers(self, symbols: list[str]) -> AsyncIterator[dict[str, Any]]:
        """Yield live mini-ticker updates from the combined WS stream."""
        streams = "/".join(f"{s.lower()}@miniTicker" for s in symbols)
        url = f"{WS_BASE}?streams={streams}"
        while True:
            try:
                async with websockets.connect(
                    url, ping_interval=20, ssl=_ws_ssl_context()
                ) as ws:
                    logger.info("WS connected: %s", url)
                    async for raw in ws:
                        msg = json.loads(raw)
                        payload = msg.get("data", {})
                        if payload.get("e") == "24hrMiniTicker":
                            yield {
                                "symbol": payload["s"],
                                "last_price": float(payload["c"]),
                                "open_24h": float(payload["o"]),
                                "high_24h": float(payload["h"]),
                                "low_24h": float(payload["l"]),
                                "volume": float(payload["v"]),
                            }
            except Exception as exc:  # noqa: BLE001 — reconnect on any failure
                logger.warning("WS error (%s); reconnecting in 5s...", exc)
                await asyncio.sleep(5)

    # ------------------------------------------------------------------ #
    # ExecutionAdapter                                                    #
    # ------------------------------------------------------------------ #

    async def account(self) -> dict[str, Any]:
        data = await self._get("/fapi/v2/account", self._signed_params())
        assets = [
            {
                "asset": a["asset"],
                "balance": float(a["walletBalance"]),
                "available": float(a["availableBalance"]),
                "pnl_unrealized": float(a["crossUnPnl"]),
            }
            for a in data.get("assets", [])
            if float(a["walletBalance"]) != 0 or float(a["crossUnPnl"]) != 0
        ]
        return {
            "total_wallet_balance": float(data["totalWalletBalance"]),
            "total_margin_balance": float(data["totalMarginBalance"]),
            "total_pnl_unrealized": float(data["totalUnrealizedProfit"]),
            "available": float(data["availableBalance"]),
            "assets": assets,
        }

    async def positions(self) -> list[dict[str, Any]]:
        data = await self._get("/fapi/v2/positionRisk", self._signed_params())
        return [
            {
                "symbol": p["symbol"],
                "side": p["positionSide"],
                "size": float(p["positionAmt"]),
                "entry_price": float(p["entryPrice"]),
                "mark_price": float(p["markPrice"]),
                "pnl_unrealized": float(p["unRealizedProfit"]),
                "liquidation_price": float(p["liquidationPrice"]),
                "leverage": int(p["leverage"]),
                "margin_type": p["marginType"],
            }
            for p in data
            if float(p["positionAmt"]) != 0
        ]

    async def open_orders(self) -> list[dict[str, Any]]:
        data = await self._get("/fapi/v1/openOrders", self._signed_params())
        return [self._normalize_order(o) for o in data]

    async def order_history(self, limit: int = 50) -> list[dict[str, Any]]:
        data = await self._get(
            "/fapi/v1/allOrders", {**self._signed_params(), "limit": limit}
        )
        return [self._normalize_order(o) for o in data]

    def _normalize_order(self, o: dict[str, Any]) -> dict[str, Any]:
        return {
            "order_id": o["orderId"],
            "symbol": o["symbol"],
            "side": o["side"],
            "type": o["type"],
            "status": o["status"],
            "price": float(o["price"]) if float(o["price"]) > 0 else None,
            "stop_price": float(o["stopPrice"]) if float(o["stopPrice"]) > 0 else None,
            "orig_qty": float(o["origQty"]),
            "executed_qty": float(o["executedQty"]),
            "avg_fill_price": (
                float(o["avgPrice"]) if float(o["avgPrice"]) > 0 else None
            ),
            "reduce_only": o.get("reduceOnly", False),
            "time": o["time"],
            "update_time": o["updateTime"],
        }

    async def place_order(
        self,
        symbol: str,
        side: str,
        order_type: str,
        quantity: float | None = None,
        price: float | None = None,
        stop_price: float | None = None,
        reduce_only: bool = False,
    ) -> dict[str, Any]:
        filters = await self._symbol_filters(symbol)
        params: dict[str, Any] = {
            "symbol": symbol.upper(),
            "side": side.upper(),
            "type": order_type.upper(),
        }
        if quantity is not None:
            params["quantity"] = self._round_to(quantity, filters["step"])
        if price is not None:
            params["price"] = self._round_to(price, filters["tick"])
        if stop_price is not None:
            params["stopPrice"] = self._round_to(stop_price, filters["tick"])
        if reduce_only:
            params["reduceOnly"] = "true"

        result = await self._post("/fapi/v1/order", self._signed_params(params))
        return {
            "order_id": result["orderId"],
            "symbol": result["symbol"],
            "side": result["side"],
            "type": result["type"],
            "status": result["status"],
            "price": float(result["price"]) if float(result["price"]) > 0 else None,
            "orig_qty": float(result["origQty"]),
            "update_time": result["updateTime"],
        }

    async def cancel_order(self, symbol: str, order_id: str) -> dict[str, Any]:
        result = await self._delete(
            "/fapi/v1/order",
            self._signed_params({"symbol": symbol.upper(), "orderId": int(order_id)}),
        )
        return {"order_id": result["orderId"], "status": result["status"]}

    async def close(self) -> None:
        await self._client.aclose()