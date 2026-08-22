"""OKX v5 execution adapter (private endpoints).

Signing scheme (v5):
  sign = base64(hmac_sha256(secret, timestamp + METHOD + requestPath + body))
Headers: OK-ACCESS-KEY / OK-ACCESS-SIGN / OK-ACCESS-TIMESTAMP / OK-ACCESS-PASSPHRASE
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from app.adapters.base import ExecutionAdapter
from app.config import settings

logger = logging.getLogger(__name__)

REST_BASE = "https://www.okx.com"


def _to_okx_symbol(symbol: str) -> str:
    s = symbol.upper()
    if s.endswith("USDT"):
        return f"{s[:-4]}-USDT-SWAP"
    return f"{s}-USD-SWAP"


def _iso_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


class OkxExecutionAdapter(ExecutionAdapter):
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(base_url=REST_BASE, timeout=15)

    # ------------------------------------------------------------------ #
    # Signing                                                             #
    # ------------------------------------------------------------------ #

    def _headers(self, method: str, path: str, body: str = "") -> dict[str, str]:
        if not settings.okx_api_key:
            raise RuntimeError(
                "OKX API key not configured (set OKX_API_KEY/SECRET/PASSPHRASE)"
            )
        ts = _iso_timestamp()
        payload = f"{ts}{method}{path}{body}"
        sign = base64.b64encode(
            hmac.new(
                settings.okx_api_secret.encode(), payload.encode(), hashlib.sha256
            ).digest()
        ).decode()
        return {
            "OK-ACCESS-KEY": settings.okx_api_key,
            "OK-ACCESS-SIGN": sign,
            "OK-ACCESS-TIMESTAMP": ts,
            "OK-ACCESS-PASSPHRASE": settings.okx_passphrase,
            "Content-Type": "application/json",
        }

    async def _request(
        self, method: str, path: str, params: dict[str, Any] | None = None
    ) -> Any:
        body = json.dumps(params) if params else ""
        headers = self._headers(method, path, body)
        resp = await self._client.request(method, path, content=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        if data.get("code") != "0":
            raise RuntimeError(f"OKX error {data.get('code')}: {data.get('msg')}")
        return data.get("data", [])

    # ------------------------------------------------------------------ #
    # ExecutionAdapter                                                    #
    # ------------------------------------------------------------------ #

    async def account(self) -> dict[str, Any]:
        rows = await self._request("GET", "/api/v5/account/balance")
        details = rows[0].get("details", []) if rows else []
        assets = [
            {
                "asset": d["ccy"],
                "balance": float(d["eq"]),
                "available": float(d["availEq"]),
                "pnl_unrealized": 0.0,
            }
            for d in details
            if float(d.get("eq", 0)) != 0
        ]
        total_eq = sum(a["balance"] for a in assets)
        return {
            "total_wallet_balance": round(total_eq, 4),
            "total_margin_balance": round(total_eq, 4),
            "total_pnl_unrealized": 0.0,
            "available": round(sum(a["available"] for a in assets), 4),
            "assets": assets,
        }

    async def positions(self) -> list[dict[str, Any]]:
        rows = await self._request(
            "GET", "/api/v5/account/positions", {"instType": "SWAP"}
        )
        out = []
        for p in rows:
            size = float(p.get("pos", 0))
            if size == 0:
                continue
            out.append(
                {
                    "symbol": p["instId"].split("-")[0]
                    + p["instId"].split("-")[1],
                    "side": "LONG" if p["posSide"] in ("long", "net") and size > 0 else "SHORT",
                    "size": size,
                    "entry_price": float(p.get("avgPx", 0)),
                    "mark_price": float(p.get("markPx", 0)),
                    "pnl_unrealized": float(p.get("upl", 0)),
                    "liquidation_price": float(p.get("liqPx") or 0),
                    "leverage": int(float(p.get("lever", 1))),
                    "margin_type": p.get("mgnMode", "cross"),
                }
            )
        return out

    async def open_orders(self) -> list[dict[str, Any]]:
        rows = await self._request(
            "GET", "/api/v5/trade/orders-pending", {"instType": "SWAP"}
        )
        return [self._norm_order(o) for o in rows]

    async def order_history(self, limit: int = 50) -> list[dict[str, Any]]:
        rows = await self._request(
            "GET",
            "/api/v5/trade/orders-history",
            {"instType": "SWAP", "limit": min(limit, 100)},
        )
        return [self._norm_order(o) for o in rows]

    @staticmethod
    def _norm_order(o: dict[str, Any]) -> dict[str, Any]:
        px = float(o.get("px") or 0)
        sl_px = float(o.get("slTriggerPx") or o.get("triggerPx") or 0)
        status_map = {
            "live": "NEW",
            "partially_filled": "PARTIALLY_FILLED",
            "filled": "FILLED",
            "canceled": "CANCELED",
        }
        return {
            "order_id": o["ordId"],
            "symbol": o["instId"].split("-")[0] + o["instId"].split("-")[1],
            "side": o["side"].upper(),
            "type": o["ordType"].upper(),
            "status": status_map.get(o["state"], o["state"]),
            "price": px if px > 0 else None,
            "stop_price": sl_px if sl_px > 0 else None,
            "orig_qty": float(o.get("sz", 0)),
            "executed_qty": float(o.get("accFillSz", 0)),
            "avg_fill_price": (
                float(o["avgPx"]) if float(o.get("avgPx") or 0) > 0 else None
            ),
            "reduce_only": o.get("reduceOnly", False),
            "time": int(o.get("cTime", 0)),
            "update_time": int(o.get("uTime", 0)),
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
        inst_id = _to_okx_symbol(symbol)
        ord_type_map = {
            "MARKET": "market",
            "LIMIT": "limit",
            "STOP_MARKET": "trigger",
            "TAKE_PROFIT_MARKET": "trigger",
        }
        ord_type = ord_type_map[order_type.upper()]
        params: dict[str, Any] = {
            "instId": inst_id,
            "tdMode": "cross",
            "side": side.lower(),
            "ordType": ord_type,
            "sz": str(quantity or 0),
        }
        if reduce_only:
            params["reduceOnly"] = True
        if price is not None and ord_type == "limit":
            params["px"] = str(price)
        if stop_price is not None and ord_type == "trigger":
            params["triggerPx"] = str(stop_price)
            params["orderPx"] = "-1"  # market execution on trigger

        rows = await self._request("POST", "/api/v5/trade/order", params)
        r = rows[0]
        if r.get("sCode") != "0":
            raise RuntimeError(f"OKX order rejected: {r.get('sMsg')}")
        return {
            "order_id": r["ordId"],
            "symbol": symbol.upper(),
            "side": side.upper(),
            "type": order_type.upper(),
            "status": "NEW",
            "price": price,
            "orig_qty": quantity or 0,
            "update_time": int(time.time() * 1000),
        }

    async def cancel_order(self, symbol: str, order_id: str) -> dict[str, Any]:
        rows = await self._request(
            "POST",
            "/api/v5/trade/cancel-order",
            {"instId": _to_okx_symbol(symbol), "ordId": str(order_id)},
        )
        r = rows[0]
        if r.get("sCode") != "0":
            raise RuntimeError(f"OKX cancel failed: {r.get('sMsg')}")
        return {"order_id": int(order_id), "status": "CANCELED"}

    async def close(self) -> None:
        await self._client.aclose()