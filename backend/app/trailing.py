"""Trailing stop manager — protect profits on open positions.

For each open position, once unrealized PnL reaches `activation_pct` of
the entry price, a trailing stop trails at `trail_pct` behind the best
price seen. Implemented by amending the exchange SL order when the
trailing level improves.

Runs in the background loop; state (best price per symbol) kept in
memory and reset when the position closes.
"""
from __future__ import annotations

import logging
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

# symbol -> best price seen since activation
_best: dict[str, float] = {}


def get_trailing_state() -> dict[str, Any]:
    return {"best_prices": dict(_best)}


def reset_symbol(symbol: str) -> None:
    _best.pop(symbol, None)


async def manage_trailing_stops() -> list[dict[str, Any]]:
    """Check all open positions; move SL up/down when trailing improves."""
    from app.adapters import get_execution_adapter

    fired: list[dict[str, Any]] = []
    try:
        adapter = get_execution_adapter(settings.trailing_venue)
        positions = await adapter.positions()
        open_orders = await adapter.open_orders()
    except Exception as exc:  # noqa: BLE001 — no key etc.
        logger.debug("Trailing skipped: %s", exc)
        return fired

    # Index existing SL orders per symbol (STOP_MARKET reduce-only).
    sl_orders = {
        o["symbol"]: o
        for o in open_orders
        if o["type"] == "STOP_MARKET" and o["reduce_only"]
    }

    for p in positions:
        symbol = p["symbol"]
        direction = 1 if p["size"] > 0 else -1
        entry = p["entry_price"]
        mark = p["mark_price"]

        move_pct = (mark - entry) / entry * 100 * direction
        if move_pct < settings.trailing_activation_pct:
            _best.pop(symbol, None)  # not activated / reset
            continue

        # Track best price in the favorable direction.
        best = _best.get(symbol)
        best_price = mark if best is None else (
            max(best, mark) if direction == 1 else min(best, mark)
        )
        _best[symbol] = best_price

        # Trailing level = best ± trail_pct.
        new_sl = best_price * (1 - direction * settings.trailing_trail_pct / 100)

        current_sl_order = sl_orders.get(symbol)
        current_sl = current_sl_order["stop_price"] if current_sl_order else None

        # Only move SL in the favorable direction.
        improves = (
            current_sl is None
            or (direction == 1 and new_sl > current_sl)
            or (direction == -1 and new_sl < current_sl)
        )
        if not improves or current_sl_order is None:
            continue

        try:
            # Cancel old SL, place new trailing SL.
            await adapter.cancel_order(symbol, str(current_sl_order["order_id"]))
            await adapter.place_order(
                symbol=symbol,
                side="SELL" if direction == 1 else "BUY",
                order_type="STOP_MARKET",
                quantity=abs(p["size"]),
                stop_price=round(new_sl, 6),
                reduce_only=True,
            )
            fired.append(
                {
                    "symbol": symbol,
                    "old_sl": current_sl,
                    "new_sl": round(new_sl, 6),
                    "best_price": best_price,
                    "move_pct": round(move_pct, 2),
                }
            )
            logger.info(
                "TRAILING SL %s: %s -> %s (best %s)",
                symbol, current_sl, round(new_sl, 6), best_price,
            )

            from app.alerts import dispatch_alert

            await dispatch_alert(
                "alert",
                {
                    "symbol": symbol,
                    "message": f"Trailing SL moved: {current_sl} → {round(new_sl, 6)} "
                               f"(lãi {move_pct:+.1f}%)",
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Trailing update failed for %s: %s", symbol, exc)

    return fired