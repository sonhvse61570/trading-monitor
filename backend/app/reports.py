"""Scheduled reports — daily/weekly performance summaries via Telegram."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.adapters import get_execution_adapter
from app.alerts import send_telegram
from app.analytics import compute_metrics

logger = logging.getLogger(__name__)


async def generate_report(period: str = "daily") -> dict[str, Any] | None:
    """Build a performance report from recent order history."""
    try:
        adapter = get_execution_adapter()
        orders = await adapter.order_history(500)
    except Exception as exc:  # noqa: BLE001 — no API key configured etc.
        logger.info("Report skipped: %s", exc)
        return None

    metrics = compute_metrics(orders)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    win_rate = metrics["win_rate"] if metrics["win_rate"] is not None else "—"
    pf = metrics["profit_factor"] if metrics["profit_factor"] is not None else "—"
    text = (
        f"📊 <b>{period.capitalize()} Trading Report</b> ({now})\n"
        f"────────────────────\n"
        f"Trades: <b>{metrics['total_trades']}</b>\n"
        f"Win rate: <b>{win_rate}</b>\n"
        f"PnL: <b>{metrics['total_pnl']:+.4f}</b>\n"
        f"Profit factor: <b>{pf}</b>\n"
        f"Max DD: <b>{metrics['max_drawdown_pct']}%</b>"
    )
    sent = await send_telegram(text)
    return {"period": period, "sent": sent, "metrics": metrics}