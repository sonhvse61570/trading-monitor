"""Phase 3 routes: multi-venue market data + backtesting."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.adapters import get_market_adapter, list_venues
from app.backtest import run_backtest
from app.strategies import STRATEGIES

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/api/venues")
async def venues() -> list[dict[str, str]]:
    return list_venues()


@router.get("/api/market/tickers")
async def tickers_multi(venue: str = "binance") -> list[dict[str, Any]]:
    try:
        return await get_market_adapter(venue).tickers()
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Exchange error: {exc}") from exc


@router.get("/api/market/klines")
async def klines_multi(
    symbol: str,
    interval: str = Query(default="15m"),
    limit: int = Query(default=200, ge=10, le=1000),
    venue: str = "binance",
) -> list[dict[str, Any]]:
    try:
        return await get_market_adapter(venue).klines(symbol.upper(), interval, limit)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Exchange error: {exc}") from exc


@router.get("/api/walkforward")
async def walk_forward_validate(
    strategy: str,
    symbol: str = "BTCUSDT",
    interval: str = Query(default="15m"),
    limit: int = Query(default=1000, ge=200, le=1000),
    folds: int = Query(default=3, ge=2, le=5),
    venue: str = "binance",
) -> dict[str, Any]:
    """Walk-forward validation: does the optimized setup hold out-of-sample?"""
    from app.walkforward import walk_forward

    try:
        return await walk_forward(strategy, symbol, interval, limit, folds, venue)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("walkforward failed")
        raise HTTPException(502, f"Validation error: {exc}") from exc


@router.get("/api/optimize")
async def optimize_strategy(
    strategy: str,
    symbol: str = "BTCUSDT",
    interval: str = Query(default="15m"),
    limit: int = Query(default=1000, ge=100, le=1000),
    venue: str = "binance",
    top_n: int = Query(default=10, ge=1, le=27),
) -> dict[str, Any]:
    """Grid-search strategy parameters, ranked by robustness score."""
    from app.optimizer import optimize

    try:
        return await optimize(strategy, symbol, interval, limit, venue, top_n)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("optimize failed")
        raise HTTPException(502, f"Optimization error: {exc}") from exc


class BacktestRequest(BaseModel):
    strategy: str
    symbol: str = "BTCUSDT"
    interval: str = "1h"
    limit: int = Query(default=500, ge=100, le=1000)
    venue: str = "binance"
    slippage_bps: float = Query(default=2.0, ge=0, le=100)


@router.post("/api/backtest")
async def backtest(req: BacktestRequest) -> dict[str, Any]:
    if req.strategy not in STRATEGIES:
        raise HTTPException(
            400, f"Unknown strategy '{req.strategy}'. Available: {list(STRATEGIES)}"
        )
    adapter = get_market_adapter(req.venue)
    try:
        candles = await adapter.klines(req.symbol.upper(), req.interval, req.limit)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Exchange error: {exc}") from exc

    result = run_backtest(
        req.strategy,
        candles,
        req.symbol.upper(),
        req.interval,
        slippage_bps=req.slippage_bps,
    )
    return result.to_dict()
