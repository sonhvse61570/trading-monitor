"""Alert dispatcher — sends notifications to configured channels.

Currently supports Telegram via bot token + chat id from settings.
Failures are logged, never raised (alerts must not break the app).
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


async def send_telegram(text: str) -> bool:
    """Send a message through the Telegram Bot API. Returns success."""
    from app.config import settings

    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        logger.debug("Telegram not configured; skipping alert")
        return False
    url = (
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    )
    payload = {
        "chat_id": settings.telegram_chat_id,
        "text": text,
        "parse_mode": "HTML",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Telegram send failed: %s", exc)
        return False


async def dispatch_alert(kind: str, data: dict[str, Any]) -> None:
    """Format and fan out an alert to all enabled channels."""
    lines = _format(kind, data)
    if not lines:
        return
    text = "\n".join(lines)
    await send_telegram(text)


def _format(kind: str, d: dict[str, Any]) -> list[str]:
    if kind == "signal":
        emoji = {"LONG": "🟢", "SHORT": "🔴", "EXIT": "⚪️"}.get(d.get("side", ""), "•")
        return [
            f"{emoji} <b>{d.get('side')}</b> signal — {d.get('symbol')}",
            f"Strategy: <code>{d.get('strategy')}</code>",
            f"Price: <code>{d.get('price')}</code>",
            f"Reason: {d.get('reason')}",
        ]
    if kind == "alert":
        return [
            f"🔔 <b>ALERT</b> — {d.get('symbol')}",
            f"{d.get('message', '')}",
        ]
    if kind == "risk":
        return [
            f"🚨 <b>RISK WARNING</b>",
            f"{d.get('message', '')}",
        ]
    return []


# --------------------------------------------------------------------- #
# Price alerts                                                           #
# --------------------------------------------------------------------- #

# symbol -> list of {op: ">"|"<", price: float}
_price_alerts: list[dict[str, Any]] = []


def add_price_alert(symbol: str, op: str, price: float) -> dict[str, Any]:
    alert = {
        "symbol": symbol.upper(),
        "op": op,
        "price": price,
        "triggered": False,
    }
    try:
        from app.db import save_price_alert

        alert = save_price_alert(alert)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Alert persistence failed: %s", exc)
        alert = {**alert, "id": len(_price_alerts) + int(time.time())}
    _price_alerts.append(alert)
    return alert


def load_alerts_from_db() -> None:
    """Hydrate the in-memory cache from SQLite at startup."""
    global _price_alerts
    try:
        from app.db import load_price_alerts

        _price_alerts = [
            {**a, "triggered": bool(a["triggered"])}
            for a in load_price_alerts(include_triggered=False)
        ]
        logger.info("Loaded %d active price alerts from DB", len(_price_alerts))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Alert hydration failed: %s", exc)


def list_price_alerts() -> list[dict[str, Any]]:
    return list(_price_alerts)


def remove_price_alert(alert_id: int) -> bool:
    removed = False
    try:
        from app.db import delete_price_alert

        removed = delete_price_alert(alert_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Alert delete failed: %s", exc)
    before = len(_price_alerts)
    _price_alerts[:] = [a for a in _price_alerts if a["id"] != alert_id]
    return removed or len(_price_alerts) < before


async def check_price_alerts(tickers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Check live tickers against stored alerts; fire Telegram on trigger."""
    fired: list[dict[str, Any]] = []
    by_symbol = {t["symbol"]: t["last_price"] for t in tickers}
    for a in _price_alerts:
        if a["triggered"]:
            continue
        price = by_symbol.get(a["symbol"])
        if price is None:
            continue
        hit = (a["op"] == ">=" and price >= a["price"]) or (
            a["op"] == "<=" and price <= a["price"]
        )
        if hit:
            a["triggered"] = True
            fired.append(a)
            try:
                from app.db import mark_alert_triggered

                mark_alert_triggered(a["id"])
            except Exception:  # noqa: BLE001
                pass
            await dispatch_alert(
                "alert",
                {
                    "symbol": a["symbol"],
                    "message": f"Giá {'≥' if a['op'] == '>=' else '≤'} "
                               f"{a['price']} — hiện tại {price}",
                },
            )
    return fired


import time  # noqa: E402  (used by add_price_alert)