"""Risk monitor — exposure, margin usage, drawdown guard.

Evaluates account risk on a schedule; fires Telegram alerts when limits
are breached. Thresholds configurable via env.
"""
from __future__ import annotations

import logging
from typing import Any

from app.adapters import get_execution_adapter
from app.alerts import dispatch_alert
from app.config import settings

logger = logging.getLogger(__name__)

# Cooldown so we don't spam Telegram every tick (seconds per rule).
_COOLDOWN: dict[str, float] = {}
COOLDOWN_SECONDS = 300.0


def _cooldown_ok(rule: str) -> bool:
    import time

    now = time.time()
    if now - _COOLDOWN.get(rule, 0) < COOLDOWN_SECONDS:
        return False
    _COOLDOWN[rule] = now
    return True


async def check_risk() -> list[dict[str, Any]]:
    """Run all risk checks; returns fired warnings."""
    fired: list[dict[str, Any]] = []
    try:
        adapter = get_execution_adapter()
        account = await adapter.account()
        positions = await adapter.positions()
    except Exception as exc:  # noqa: BLE001 — no key configured
        logger.debug("Risk check skipped: %s", exc)
        return fired

    # 1. Unrealized drawdown guard (account-level PnL vs wallet balance)
    wallet = account.get("total_wallet_balance", 0)
    upnl = account.get("total_pnl_unrealized", 0)
    if wallet > 0 and upnl < 0:
        dd_pct = abs(upnl) / wallet * 100
        limit = settings.max_drawdown_pct
        if dd_pct >= limit and _cooldown_ok("drawdown"):
            warning = {
                "rule": "drawdown",
                "message": f"Unrealized drawdown {dd_pct:.1f}% vượt giới hạn {limit}%",
                "severity": "critical" if dd_pct >= limit * 1.5 else "warning",
            }
            fired.append(warning)
            await dispatch_alert("risk", warning)

    # 2. Margin usage: total position notional vs available balance
    notional = sum(abs(p["size"]) * p["mark_price"] for p in positions)
    available = account.get("available", 0)
    margin_balance = account.get("total_margin_balance", 0)
    if margin_balance > 0:
        usage = notional / margin_balance
        limit = settings.max_margin_usage
        if usage >= limit and _cooldown_ok("margin"):
            warning = {
                "rule": "margin",
                "message": (
                    f"Margin usage {usage*100:.0f}% vượt giới hạn {limit*100:.0f}% "
                    f"(notional ${notional:.0f})"
                ),
                "severity": "warning",
            }
            fired.append(warning)
            await dispatch_alert("risk", warning)

    # 3. Position count guard (too many concurrent positions)
    max_pos = settings.max_positions
    if len(positions) > max_pos and _cooldown_ok("positions"):
        warning = {
            "rule": "positions",
            "message": f"Đang mở {len(positions)} vị thế > giới hạn {max_pos}",
            "severity": "warning",
        }
        fired.append(warning)
        await dispatch_alert("risk", warning)

    return fired


def risk_snapshot(
    account: dict[str, Any] | None, positions: list[dict[str, Any]]
) -> dict[str, Any]:
    """Compute current risk metrics for UI display (no alerts)."""
    if not account:
        return {"available": False}
    wallet = account.get("total_wallet_balance", 0)
    upnl = account.get("total_pnl_unrealized", 0)
    notional = sum(abs(p["size"]) * p["mark_price"] for p in positions)
    margin_balance = account.get("total_margin_balance", 0)
    return {
        "available": True,
        "wallet_balance": wallet,
        "unrealized_pnl": upnl,
        "drawdown_pct": round(abs(upnl) / wallet * 100, 2) if wallet > 0 and upnl < 0 else 0.0,
        "max_drawdown_pct": settings.max_drawdown_pct,
        "notional": round(notional, 2),
        "margin_usage": round(notional / margin_balance, 3) if margin_balance > 0 else 0.0,
        "max_margin_usage": settings.max_margin_usage,
        "open_positions": len(positions),
        "max_positions": settings.max_positions,
    }