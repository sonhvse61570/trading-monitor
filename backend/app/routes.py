"""REST API routes."""
from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.adapters import get_execution_adapter, get_market_adapter

logger = logging.getLogger(__name__)
router = APIRouter()


# --------------------------------------------------------------------- #
# Schemas                                                                #
# --------------------------------------------------------------------- #


class OrderRequest(BaseModel):
    symbol: str = Field(..., examples=["BTCUSDT"])
    side: Literal["BUY", "SELL"]
    order_type: Literal["MARKET", "LIMIT", "STOP_MARKET", "TAKE_PROFIT_MARKET"]
    quantity: float | None = None
    price: float | None = None
    stop_price: float | None = None
    reduce_only: bool = False


class CancelRequest(BaseModel):
    symbol: str
    order_id: str


# --------------------------------------------------------------------- #
# System                                                                 #
# --------------------------------------------------------------------- #


@router.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


# --------------------------------------------------------------------- #
# Market data                                                            #
# --------------------------------------------------------------------- #


@router.get("/api/market/tickers")
async def tickers(venue: str = "binance") -> list[dict[str, Any]]:
    adapter = get_market_adapter(venue)
    try:
        return await adapter.tickers()
    except Exception as exc:  # noqa: BLE001
        logger.exception("tickers failed")
        raise HTTPException(502, f"Exchange error: {exc}") from exc


@router.get("/api/market/klines")
async def klines(
    symbol: str,
    interval: str = Query(
        default="15m",
        pattern="^(1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w)$",
    ),
    limit: int = Query(default=200, ge=10, le=1000),
    venue: str = "binance",
) -> list[dict[str, Any]]:
    adapter = get_market_adapter(venue)
    try:
        return await adapter.klines(symbol.upper(), interval, limit)
    except Exception as exc:  # noqa: BLE001
        logger.exception("klines failed")
        raise HTTPException(502, f"Exchange error: {exc}") from exc


@router.get("/api/market/orderbook")
async def order_book(
    symbol: str, limit: int = Query(default=20, ge=5, le=100), venue: str = "binance"
) -> dict[str, Any]:
    adapter = get_market_adapter(venue)
    try:
        return await adapter.order_book(symbol.upper(), limit)
    except Exception as exc:  # noqa: BLE001
        logger.exception("orderbook failed")
        raise HTTPException(502, f"Exchange error: {exc}") from exc


@router.get("/api/market/trades")
async def recent_trades(
    symbol: str, limit: int = Query(default=50, ge=1, le=500), venue: str = "binance"
) -> list[dict[str, Any]]:
    adapter = get_market_adapter(venue)
    try:
        return await adapter.recent_trades(symbol.upper(), limit)
    except Exception as exc:  # noqa: BLE001
        logger.exception("trades failed")
        raise HTTPException(502, f"Exchange error: {exc}") from exc


# --------------------------------------------------------------------- #
# Account & trading                                                      #
# --------------------------------------------------------------------- #


@router.get("/api/account")
async def account(venue: str = "binance") -> dict[str, Any]:
    adapter = get_execution_adapter(venue)
    try:
        return await adapter.account()
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("account failed")
        raise HTTPException(502, f"Exchange error: {exc}") from exc


@router.get("/api/positions")
async def positions(venue: str = "binance") -> list[dict[str, Any]]:
    adapter = get_execution_adapter(venue)
    try:
        return await adapter.positions()
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("positions failed")
        raise HTTPException(502, f"Exchange error: {exc}") from exc


@router.get("/api/orders/open")
async def open_orders(venue: str = "binance") -> list[dict[str, Any]]:
    adapter = get_execution_adapter(venue)
    try:
        return await adapter.open_orders()
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("open orders failed")
        raise HTTPException(502, f"Exchange error: {exc}") from exc


@router.get("/api/orders/history")
async def order_history(
    limit: int = Query(default=50, ge=1, le=500), venue: str = "binance"
) -> list[dict[str, Any]]:
    adapter = get_execution_adapter(venue)
    try:
        return await adapter.order_history(limit)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("order history failed")
        raise HTTPException(502, f"Exchange error: {exc}") from exc


@router.post("/api/orders")
async def place_order(req: OrderRequest, venue: str = "binance") -> dict[str, Any]:
    adapter = get_execution_adapter(venue)
    try:
        result = await adapter.place_order(
            symbol=req.symbol,
            side=req.side,
            order_type=req.order_type,
            quantity=req.quantity,
            price=req.price,
            stop_price=req.stop_price,
            reduce_only=req.reduce_only,
        )
        logger.info("ORDER PLACED: %s %s %s qty=%s price=%s -> id=%s",
                    req.side, req.symbol, req.order_type,
                    req.quantity, req.price, result.get("order_id"))
        return result
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("place order failed")
        raise HTTPException(502, f"Exchange error: {exc}") from exc


@router.delete("/api/orders/{order_id}")
async def cancel_order(order_id: str, symbol: str, venue: str = "binance") -> dict[str, Any]:
    adapter = get_execution_adapter(venue)
    try:
        return await adapter.cancel_order(symbol.upper(), order_id)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("cancel order failed")
        raise HTTPException(502, f"Exchange error: {exc}") from exc