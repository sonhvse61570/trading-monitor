"""Auto-trading engine — executes signals with SL/TP brackets.

When enabled, evaluates strategies on a schedule and, for each new
signal, places an entry order plus OCO-style SL/TP orders on the venue.
Position sizing is risk-based: risk a fixed % of available balance per
trade based on the signal's stop distance.

Safety:
- OFF by default; enable via AUTOTRADE_ENABLED=true in .env
- Only runs on the configured venue/symbols
- Skips if a position already exists for the symbol
- Max concurrent positions guard
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

_state: dict[str, Any] = {
    "enabled": False,
    "last_run": None,
    "trades_opened": 0,
    "errors": [],
}


def get_status() -> dict[str, Any]:
    return dict(_state)


def set_enabled(enabled: bool) -> None:
    _state["enabled"] = enabled
    logger.warning("AUTOTRADER %s", "ENABLED" if enabled else "DISABLED")


async def run_once() -> list[dict[str, Any]]:
    """One auto-trade cycle: scan → filter → size → execute with bracket."""
    from app.adapters import get_execution_adapter, get_market_adapter
    from app.strategies import STRATEGIES, run_scan_once

    if not _state["enabled"]:
        return []

    executed: list[dict[str, Any]] = []
    exec_adapter = get_execution_adapter(settings.autotrade_venue)
    market_adapter = get_market_adapter(settings.autotrade_venue)

    try:
        positions = await exec_adapter.positions()
        account = await exec_adapter.account()
    except Exception as exc:  # noqa: BLE001
        _state["errors"] = [str(exc)]
        return []

    open_symbols = {p["symbol"] for p in positions}
    if len(positions) >= settings.max_positions:
        logger.info("Autotrader: max positions reached (%d)", len(positions))
        return []

    # Risk-based sizing: risk autotrade_risk_pct of balance per trade.
    balance = account.get("available", 0)
    risk_amount = balance * settings.autotrade_risk_pct / 100

    signals = await run_scan_once(
        [s.strip().upper() for s in settings.scan_symbols.split(",")],
        settings.autotrade_interval,
    )

    for sig in signals:
        if sig["symbol"] in open_symbols:
            continue
        if len(positions) >= settings.max_positions:
            break

        sl = sig.get("stop_loss")
        tp = sig.get("take_profit")
        entry = sig.get("price") or 0
        if not sl or not entry or sl == entry:
            # No valid stop → skip (never trade without a stop).
            continue

        # Position size so that hitting SL loses exactly `risk_amount`.
        per_unit_loss = abs(entry - sl)
        qty = risk_amount / per_unit_loss if per_unit_loss > 0 else 0
        if qty <= 0:
            continue

        side = "BUY" if sig["side"] == "LONG" else "SELL"
        try:
            order = await exec_adapter.place_order(
                symbol=sig["symbol"],
                side=side,
                order_type="MARKET",
                quantity=qty,
            )
            # Bracket: SL + TP as reduce-only orders.
            close_side = "SELL" if side == "BUY" else "BUY"
            await exec_adapter.place_order(
                symbol=sig["symbol"],
                side=close_side,
                order_type="STOP_MARKET",
                quantity=qty,
                stop_price=sl,
                reduce_only=True,
            )
            await exec_adapter.place_order(
                symbol=sig["symbol"],
                side=close_side,
                order_type="TAKE_PROFIT_MARKET",
                quantity=qty,
                stop_price=tp,
                reduce_only=True,
            )
            executed.append(
                {
                    "signal": sig,
                    "order_id": order["order_id"],
                    "qty": round(qty, 6),
                    "sl": sl,
                    "tp": tp,
                }
            )
            positions.add(sig["symbol"])
            _state["trades_opened"] += 1

            from app.alerts import dispatch_alert

            await dispatch_alert(
                "signal",
                {
                    **sig,
                    "reason": f"{sig['reason']} | AUTO-TRADED qty={qty:.4f} "
                              f"SL={sl} TP={tp}",
                },
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Autotrade failed for %s: %s", sig["symbol"], exc)
            _state["errors"] = ([str(exc)] + _state["errors"])[:10]

    import time

    _state["last_run"] = int(time.time() * 1000)
    return executed


async def background_autotrade_loop() -> None:
    """Scheduled loop when enabled."""
    while True:
        try:
            if _state["enabled"]:
                await run_once()
            await asyncio.sleep(max(15, settings.scan_interval_seconds // 2))
        except Exception:  # noqa: BLE001 — never die
            logger.exception("Autotrade loop failed")
            await asyncio.sleep(30)