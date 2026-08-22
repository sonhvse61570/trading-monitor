"""Bybit v5 execution adapter (private endpoints).

Signing scheme (v5):
  sign = hex(hmac_sha256(secret, timestamp + api_key + recv_window + queryString|body))
Headers: X-BAPI-API-KEY / X-BAPI-SIGN / X-BAPI-TIMESTAMP / X-BAPI-RECV-WINDOW
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from typing import Any

import httpx

from app.adapters.base import ExecutionAdapter
from app.config import settings

logger = logging.getLogger(__name__)

REST_BASE = "https://api.bybit.com"
RECV_WINDOW = "5000"


class BybitExecutionAdapter(ExecutionAdapter):
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(base_url=REST_BASE, timeout=15)

    # ------------------------------------------------------------------ #
    # Signing                                                             #
    # ------------------------------------------------------------------ #

    def _headers(self, payload_str: str) -> dict[str, str]:
        if not settings.bybit_api_key:
            raise RuntimeError(
                "Bybit API key not configured (set BYBIT_API_KEY/SECRET)"
            )
        ts = str(int(time.time() * 1000))
        sign_payload = f"{ts}{settings.bybit_api_key}{RECV_WINDOW}{payload_str}"
        sign = hmac.new(
            settings.bybit_api_secret.encode(),
            sign_payload.encode(),
            hashlib.sha256,
        ).hexdigest()
        return {
            "X-BAPI-API-KEY": settings.bybit_api_key,
            "X-BAPI-SIGN": sign,
            "X-BAPI-TIMESTAMP": ts,
            "X-BAPI-RECV-WINDOW": RECV_WINDOW,
            "Content-Type": "application/json",
        }

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        query = ""
        if params:
            from urllib.parse import urlencode

            query = urlencode(params)
        headers = self._headers(query)
        resp = await self._client.get(path, params=params, headers=headers)
        resp.raise_for_status()
        body = resp.json()
        if body.get("retCode") != 0:
            raise RuntimeError(f"Bybit error {body['retCode']}: {body['retMsg']}")
        return body.get("result", {})

    async def _post(self, path: str, payload: dict[str, Any]) -> Any:
        body = json.dumps(payload)
        headers = self._headers(body)
        resp = await self._client.post(path, content=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        if data.get("retCode") != 0:
            raise RuntimeError(f"Bybit error {data['retCode']}: {data['retMsg']}")
        return data.get("result", {})

    # ------------------------------------------------------------------ #
    # ExecutionAdapter                                                    #
    # ------------------------------------------------------------------ #

    async def account(self) -> dict[str, Any]:
        result = await self._get(
            "/v5/account/wallet-balance",
            {"accountType": "UNIFIED"},
        )
        coins = []
        total_eq = total_avail = 0.0
        for acct in result.get("list", []):
            for c in acct.get("coin", []):
                eq = float(c.get("walletBalance", 0))
                avail = float(c.get("availableToWithdraw") or c.get("locked", 0))
                if eq != 0:
                    coins.append(
                        {
                            "asset": c["coin"],
                            "balance": eq,
                            "available": float(
                                c.get("availableToWithdraw") or 0
                            ),
                            "pnl_unrealized": float(c.get("unrealisedPnl", 0)),
                        }
                    )
                    total_eq += eq
                    total_avail += float(c.get("availableToWithdraw") or 0)
        return {
            "total_wallet_balance": round(total_eq, 4),
            "total_margin_balance": round(total_eq, 4),
            "total_pnl_unrealized": round(
                sum(c["pnl_unrealized"] for c in coins), 4
            ),
            "available": round(total_avail, 4),
            "assets": coins,
        }

    async def positions(self) -> list[dict[str, Any]]:
        result = await self._get(
            "/v5/position/list", {"category": "linear"}
        )
        out = []
        for p in result.get("list", []):
            size = float(p.get("size", 0))
            if size == 0:
                continue
            out.append(
                {
                    "symbol": p["symbol"],
                    "side": p["side"],
                    "size": size if p["side"] == "Buy" else -size,
                    "entry_price": float(p.get("avgPrice", 0)),
                    "mark_price": float(p.get("markPrice", 0)),
                    "pnl_unrealized": float(p.get("unrealisedPnl", 0)),
                    "liquidation_price": float(p.get("liqPrice") or 0),
                    "leverage": int(float(p.get("leverage", 1))),
                    "margin_type": p.get("tradeMode", "cross"),
                }
            )
        return out

    async def open_orders(self) -> list[dict[str, Any]]:
        result = await self._get(
            "/v5/order/realtime", {"category": "linear", "openOnly": 0}
        )
        return [self._norm_order(o) for o in result.get("list", [])]

    async def order_history(self, limit: int = 50) -> list[dict[str, Any]]:
        result = await self._get(
            "/v5/order/history",
            {"category": "linear", "limit": min(limit, 100)},
        )
        return [self._norm_order(o) for o in result.get("list", [])]

    @staticmethod
    def _norm_order(o: dict[str, Any]) -> dict[str, Any]:
        status_map = {
            "New": "NEW",
            "PartiallyFilled": "PARTIALLY_FILLED",
            "Filled": "FILLED",
            "Cancelled": "CANCELED",
            "Rejected": "REJECTED",
        }
        px = float(o.get("price") or 0)
        trigger = float(o.get("triggerPrice") or 0)
        return {
            "order_id": o["orderId"],
            "symbol": o["symbol"],
            "side": o["side"].upper(),
            "type": o["orderType"].upper(),
            "status": status_map.get(o["orderStatus"], o["orderStatus"]),
            "price": px if px > 0 else None,
            "stop_price": trigger if trigger > 0 else None,
            "orig_qty": float(o.get("qty", 0)),
            "executed_qty": float(o.get("cumExecQty", 0)),
            "avg_fill_price": (
                float(o["avgPrice"]) if float(o.get("avgPrice") or 0) > 0 else None
            ),
            "reduce_only": o.get("reduceOnly", False),
            "time": int(o.get("createdTime", 0)),
            "update_time": int(o.get("updatedTime", 0)),
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
        ot = order_type.upper()
        bybit_type = {"MARKET": "Market", "LIMIT": "Limit"}.get(ot)
        if not bybit_type:
            raise RuntimeError(f"Unsupported order type for Bybit: {ot}")

        payload: dict[str, Any] = {
            "category": "linear",
            "symbol": symbol.upper(),
            "side": side.capitalize(),  # Buy / Sell
            "orderType": bybit_type,
            "qty": str(quantity or 0),
        }
        if price is not None and bybit_type == "Limit":
            payload["price"] = str(price)
        if reduce_only:
            payload["reduceOnly"] = True

        result = await self._post("/v5/order/create", payload)
        return {
            "order_id": result["orderId"],
            "symbol": symbol.upper(),
            "side": side.upper(),
            "type": ot,
            "status": "NEW",
            "price": price,
            "orig_qty": quantity or 0,
            "update_time": int(time.time() * 1000),
        }

    async def cancel_order(self, symbol: str, order_id: str) -> dict[str, Any]:
        await self._post(
            "/v5/order/cancel",
            {"category": "linear", "symbol": symbol.upper(), "orderId": str(order_id)},
        )
        return {"order_id": int(order_id), "status": "CANCELED"}

    async def close(self) -> None:
        await self._client.aclose()