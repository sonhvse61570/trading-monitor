"""Walk-forward validation — detect overfitting.

Splits history into N sequential folds: optimize on fold i's "train"
segment, evaluate on the following "test" segment. If out-of-sample PF
collapses vs in-sample, the parameters are overfit.
"""
from __future__ import annotations

import logging
from typing import Any

from app.adapters import get_market_adapter
from app.backtest import run_backtest
from app.optimizer import GRIDS, _instantiate
from app.strategies import STRATEGIES

logger = logging.getLogger(__name__)


async def walk_forward(
    strategy_name: str,
    symbol: str,
    interval: str,
    limit: int = 1000,
    folds: int = 3,
    venue: str = "binance",
) -> dict[str, Any]:
    if strategy_name not in GRIDS:
        raise ValueError(
            f"No grid for '{strategy_name}'. Available: {list(GRIDS)}"
        )
    if folds < 2:
        raise ValueError("folds must be >= 2")

    adapter = get_market_adapter(venue)
    candles = await adapter.klines(symbol.upper(), interval, limit)

    # Split into `folds` equal segments; each fold trains on its first
    # half and tests on the second half of the segment.
    seg_len = len(candles) // folds
    if seg_len < 100:
        raise ValueError(f"Not enough candles ({len(candles)}) for {folds} folds")

    original = STRATEGIES[strategy_name]
    fold_results: list[dict[str, Any]] = []

    try:
        for f in range(folds):
            seg = candles[f * seg_len : (f + 1) * seg_len]
            train = seg[: seg_len // 2]
            test = seg[seg_len // 2 :]

            # --- In-sample: pick best params on train ---
            best_params: dict[str, Any] | None = None
            best_pf = -1.0
            for params in GRIDS[strategy_name]:
                STRATEGIES[strategy_name] = _instantiate(strategy_name, params)  # type: ignore[assignment]
                bt = run_backtest(strategy_name, train, symbol.upper(), interval)
                pf = bt.profit_factor or 0
                if len(bt.trades) >= 3 and pf > best_pf:
                    best_pf = pf
                    best_params = params

            if best_params is None:
                fold_results.append(
                    {"fold": f + 1, "note": "no params produced >=3 trades in-sample"}
                )
                continue

            # --- Out-of-sample: evaluate chosen params on test ---
            STRATEGIES[strategy_name] = _instantiate(strategy_name, best_params)  # type: ignore[assignment]
            oos = run_backtest(strategy_name, test, symbol.upper(), interval)
            d = oos.to_dict()
            fold_results.append(
                {
                    "fold": f + 1,
                    "params": best_params,
                    "in_sample_pf": round(best_pf, 3),
                    "out_sample_trades": d["total_trades"],
                    "out_sample_win_rate": d["win_rate"],
                    "out_sample_pnl": d["total_pnl"],
                    "out_sample_pf": d["profit_factor"],
                    "degradation": (
                        round(1 - (d["profit_factor"] or 0) / best_pf, 2)
                        if best_pf > 0 and d["profit_factor"] is not None
                        else None
                    ),
                }
            )
    finally:
        STRATEGIES[strategy_name] = original  # always restore

    # Aggregate verdict
    valid = [r for r in fold_results if "out_sample_pf" in r]
    avg_is = (
        sum(r["in_sample_pf"] for r in valid) / len(valid) if valid else None
    )
    avg_oos = (
        sum(r["out_sample_pf"] or 0 for r in valid) / len(valid) if valid else None
    )
    if avg_is and avg_oos is not None:
        ratio = avg_oos / avg_is
        verdict = (
            "ROBUST" if ratio >= 0.6 else
            "MARGINAL" if ratio >= 0.3 else
            "OVERFIT"
        )
    else:
        ratio = None
        verdict = "INSUFFICIENT_DATA"

    return {
        "strategy": strategy_name,
        "symbol": symbol.upper(),
        "interval": interval,
        "candles": len(candles),
        "folds": folds,
        "fold_results": fold_results,
        "avg_in_sample_pf": round(avg_is, 3) if avg_is else None,
        "avg_out_sample_pf": round(avg_oos, 3) if avg_oos is not None else None,
        "oos_is_ratio": round(ratio, 3) if ratio is not None else None,
        "verdict": verdict,
    }