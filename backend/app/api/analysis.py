"""Analysis domain — derived market analytics endpoints.

MTF trends, pivot points, derivatives positioning, confluence score,
trade setups, whale heatmap.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("/mtf")
async def mtf(symbol: str) -> dict[str, Any]:
    """Multi-timeframe trend matrix (5m→4h)."""
    from app.mtf import mtf_trend

    return await mtf_trend(symbol)


@router.get("/pivots")
async def pivots(symbol: str) -> dict[str, Any]:
    """Classic pivot points from the last completed daily candle."""
    from app.mtf import pivot_points

    return await pivot_points(symbol)


@router.get("/positioning")
async def positioning(symbol: str) -> dict[str, Any]:
    """Open interest + long/short ratios (Binance Futures public)."""
    from app.derivatives import positioning

    return await positioning(symbol)


@router.get("/setup")
async def setup(symbol: str) -> dict[str, Any]:
    """Actionable trade plan(s) generated from live signals."""
    from app.setup import generate_setup

    return await generate_setup(symbol)


@router.get("/confluence")
async def confluence(symbol: str) -> dict[str, Any]:
    """Composite 0-100 setup score aggregating all signal sources."""
    from app.score import confluence_score

    return await confluence_score(symbol)


@router.get("/volume-profile")
async def vp(
    symbol: str,
    interval: str = Query(default="15m"),
) -> dict[str, Any]:
    """Volume-by-price profile with POC and 70% value area."""
    from app.volume_profile import volume_profile

    return await volume_profile(symbol, interval)


@router.get("/liquidations")
async def liquidations(symbol: str) -> dict[str, Any]:
    """Estimated liquidation clusters (heuristic from large-flow)."""
    from app.liquidations import liquidation_clusters

    return await liquidation_clusters(symbol)


@router.get("/correlation")
async def correlation() -> dict[str, Any]:
    """Pearson correlation matrix of hourly returns, majors."""
    from app.liquidations import correlation_matrix

    return await correlation_matrix()


@router.get("/whale-heatmap")
async def whale_heatmap(
    symbol: str,
    min_notional: float = Query(default=25000, ge=1000),
) -> dict[str, Any]:
    """Price × time heatmap of large-fill footprints."""
    from app.heatmap import whale_heatmap

    return await whale_heatmap(symbol, min_notional)