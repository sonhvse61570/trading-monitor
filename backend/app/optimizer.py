"""Strategy parameter optimizer — grid search over parameter ranges.

Runs backtests across a parameter grid and ranks by score
(profit factor weighted by trade count, penalizing low samples).
"""
from __future__ import annotations

import itertools
import logging
from typing import Any

from app.adapters import get_market_adapter
from app.backtest import run_backtest
from app.strategies import STRATEGIES

logger = logging.getLogger(__name__)

# Parameter grids per strategy (kept small so a run finishes < ~30s).
GRIDS: dict[str, list[dict[str, Any]]] = {
    "bollinger_breakout": [
        {"period": p, "num_std": s, "vol_mult": v}
        for p in (15, 20, 25)
        for s in (1.5, 2.0, 2.5)
        for v in (1.2, 1.5, 2.0)
    ],
    "trend_pullback": [
        {"trend_period": t, "rsi_low": lo, "rsi_high": hi}
        for t in (30, 50, 100)
        for lo, hi in ((35, 65), (40, 60), (45, 55))
    ],
    "vwap_reversion": [
        {"window": w, "threshold_pct": th}
        for w in (10, 20, 40)
        for th in (1.0, 1.5, 2.0, 3.0)
    ],
}


def _instantiate(strategy_name: str, params: dict[str, Any]):
    """Create a fresh strategy instance with overridden params."""
    base = STRATEGIES[strategy_name]
    clone = object.__new__(type(base))
    clone.__dict__.update(base.__dict__)
    for k, v in params.items():
        setattr(clone, k, v)
    return clone


async def optimize(
    strategy_name: str,
    symbol: str,
    interval: str,
    limit: int = 1000,
    venue: str = "binance",
    top_n: int = 10,
) -> dict[str, Any]:
    if strategy_name not in GRIDS:
        raise ValueError(
            f"No optimization grid for '{strategy_name}'. "
            f"Available: {list(GRIDS)}"
        )

    adapter = get_market_adapter(venue)
    candles = await adapter.klines(symbol.upper(), interval, limit)

    results: list[dict[str, Any]] = []
    original = STRATEGIES[strategy_name]

    try:
        for params in GRIDS[strategy_name]:
            strat = _instantiate(strategy_name, params)
            STRATEGIES[strategy_name] = strat  # type: ignore[assignment]
            bt = run_backtest(strategy_name, candles, symbol.upper(), interval)
            d = bt.to_dict()
            trades = d["total_trades"]
            pf = d["profit_factor"] or 0
            # Score: PF scaled by sample confidence; require >= 5 trades.
            score = round(pf * min(trades / 10, 1), 3) if trades >= 5 else -1
            results.append(
                {
                    "params": params,
                    "trades": trades,
                    "win_rate": d["win_rate"],
                    "pnl_net": d["total_pnl"],
                    "profit_factor": d["profit_factor"],
                    "max_drawdown_pct": d["max_drawdown_pct"],
                    "score": score,
                }
            )
    finally:
        STRATEGIES[strategy_name] = original  # always restore

    results.sort(key=lambda r: r["score"], reverse=True)
    return {
        "strategy": strategy_name,
        "symbol": symbol.upper(),
        "interval": interval,
        "candles_tested": limit,
        "combos_tested": len(results),
        "best": results[0] if results else None,
        "top": results[:top_n],
    }