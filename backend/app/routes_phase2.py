"""Phase 2 routes: indicators, scanner, strategies/signals, alerts, analytics."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query, WebSocket
from pydantic import BaseModel

from app.adapters import get_execution_adapter, get_market_adapter
from app.alerts import (
    add_price_alert,
    check_price_alerts,
    list_price_alerts,
    remove_price_alert,
)
from app.analytics import compute_metrics
from app.indicators import bollinger, ema, latest, macd, rsi, sma, vwap
from app.scanner import scan
from app.strategies import SIGNALS, STRATEGIES, record_external_signal, run_scan_once

logger = logging.getLogger(__name__)
router = APIRouter()


# --------------------------------------------------------------------- #
# Auto-trader                                                            #
# --------------------------------------------------------------------- #


@router.get("/api/autotrade/status")
async def autotrade_status() -> dict[str, Any]:
    from app.autotrader import get_status

    return get_status()


@router.post("/api/autotrade/toggle")
async def autotrade_toggle(
    enabled: bool = Query(...),
    venue: str = Query(default="binance"),
    interval: str = Query(default="15m"),
    risk_pct: float = Query(default=1.0, ge=0.1, le=10),
) -> dict[str, Any]:
    """Enable/disable the auto-trading engine with safety params."""
    from app.autotrader import set_enabled
    from app.config import settings as s

    if enabled:
        # Refuse to enable without API keys on the target venue.
        try:
            get_execution_adapter(venue)
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

        s.autotrade_venue = venue
        s.autotrade_interval = interval
        s.autotrade_risk_pct = risk_pct

    set_enabled(enabled)
    logger.warning("AUTOTRADE %s on %s %s risk=%.2f%%",
                   "ENABLED" if enabled else "DISABLED", venue, interval, risk_pct)
    return {"enabled": enabled, "venue": venue, "interval": interval,
            "risk_pct": risk_pct}


@router.post("/api/autotrade/run-once")
async def autotrade_run_once() -> dict[str, Any]:
    """Run a single auto-trade cycle manually (dry-run friendly)."""
    from app.autotrader import run_once, set_enabled, _state

    was_enabled = _state["enabled"]
    if not was_enabled:
        set_enabled(True)
    try:
        executed = await run_once()
    finally:
        if not was_enabled:
            set_enabled(False)
    return {"executed": executed}


# --------------------------------------------------------------------- #
# Reports                                                                #
# --------------------------------------------------------------------- #


@router.get("/api/indicators")
async def get_indicators(
    symbol: str,
    interval: str = Query(default="15m"),
    limit: int = Query(default=200, ge=50, le=1000),
) -> dict[str, Any]:
    adapter = get_market_adapter()
    try:
        candles = await adapter.klines(symbol.upper(), interval, limit)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Exchange error: {exc}") from exc

    closes = [c["close"] for c in candles]
    return {
        "symbol": symbol.upper(),
        "interval": interval,
        "last_close": closes[-1],
        "ema9": latest(ema(closes, 9)),
        "ema21": latest(ema(closes, 21)),
        "sma50": latest(sma(closes, 50)),
        "rsi14": latest(rsi(closes, 14)),
        "macd": {
            "macd": latest(macd(closes)["macd"]),
            "signal": latest(macd(closes)["signal"]),
            "hist": latest(macd(closes)["hist"]),
        },
        "bollinger": {
            "upper": latest(bollinger(closes)["upper"]),
            "mid": latest(bollinger(closes)["mid"]),
            "lower": latest(bollinger(closes)["lower"]),
        },
        "vwap20": latest(vwap(candles, rolling=20)),
    }


# --------------------------------------------------------------------- #
# Scanner                                                                #
# --------------------------------------------------------------------- #


@router.get("/api/scanner")
async def market_scanner(venue: str = Query(default="binance")) -> dict[str, Any]:
    try:
        return await scan(venue)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("scanner failed")
        raise HTTPException(502, f"Exchange error: {exc}") from exc


# --------------------------------------------------------------------- #
# Strategies & signals                                                   #
# --------------------------------------------------------------------- #


@router.get("/api/strategies")
async def list_strategies() -> list[dict[str, Any]]:
    return [
        {"name": s.name, "description": s.description}
        for s in STRATEGIES.values()
    ]


@router.get("/api/signals")
async def recent_signals(limit: int = Query(default=50, ge=1, le=500)) -> list[dict[str, Any]]:
    # Prefer DB (survives restarts); fall back to in-memory buffer.
    try:
        from app.db import load_signals

        return load_signals(limit)
    except Exception:  # noqa: BLE001
        return SIGNALS[:limit]


class ExternalSignal(BaseModel):
    strategy: str = "external"
    symbol: str
    side: str  # LONG | SHORT | EXIT
    reason: str = ""
    price: float = 0.0


@router.post("/api/signals/webhook")
async def signal_webhook(sig: ExternalSignal) -> dict[str, Any]:
    """External bots push signals here; they are stored + broadcast."""
    from app.alerts import dispatch_alert
    from app.ws_hub import hub

    recorded = record_external_signal(sig.model_dump())
    await hub.broadcast({"type": "signal", "data": recorded})
    await dispatch_alert("signal", recorded)
    return {"ok": True, "signal": recorded}


@router.post("/api/strategies/run")
async def run_strategies(
    symbols: str | None = None,
    interval: str = Query(default="15m"),
) -> dict[str, Any]:
    syms = (
        [s.strip().upper() for s in symbols.split(",")]
        if symbols
        else None
    )
    new_signals = await run_scan_once(syms or [], interval) if syms else []
    if not syms:
        from app.config import settings

        syms = [s.strip() for s in settings.scan_symbols.split(",")]
        new_signals = await run_scan_once(syms, interval)
    for sig in new_signals:
        from app.ws_hub import hub
        from app.alerts import dispatch_alert

        await hub.broadcast({"type": "signal", "data": sig})
        await dispatch_alert("signal", sig)
    return {"scanned": len(syms), "new_signals": len(new_signals), "signals": new_signals}


# --------------------------------------------------------------------- #
# Price alerts                                                           #
# --------------------------------------------------------------------- #


class AlertRequest(BaseModel):
    symbol: str
    op: str  # ">=" | "<="
    price: float


@router.get("/api/alerts")
async def get_alerts() -> list[dict[str, Any]]:
    return list_price_alerts()


@router.post("/api/alerts")
async def create_alert(req: AlertRequest) -> dict[str, Any]:
    if req.op not in (">=", "<="):
        raise HTTPException(400, "op must be '>=' or '<='")
    alert = add_price_alert(req.symbol, req.op, req.price)
    logger.info("ALERT CREATED: %s", alert)
    return alert


@router.delete("/api/alerts/{alert_id}")
async def delete_alert(alert_id: int) -> dict[str, Any]:
    ok = remove_price_alert(alert_id)
    if not ok:
        raise HTTPException(404, "Alert not found")
    return {"ok": True}


# --------------------------------------------------------------------- #
# Analytics                                                              #
# --------------------------------------------------------------------- #


@router.get("/api/analytics/performance")
async def performance(limit: int = Query(default=500, ge=10, le=1000)) -> dict[str, Any]:
    adapter = get_execution_adapter()
    try:
        orders = await adapter.order_history(limit)
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Exchange error: {exc}") from exc
    return compute_metrics(orders)


# --------------------------------------------------------------------- #
# Risk                                                                   #
# --------------------------------------------------------------------- #


@router.get("/api/risk")
async def get_risk() -> dict[str, Any]:
    """Current risk snapshot for the UI."""
    from app.risk import risk_snapshot

    try:
        acc_adapter = get_execution_adapter()
        account = await acc_adapter.account()
        positions = await acc_adapter.positions()
    except Exception:  # noqa: BLE001
        return {"available": False}
    return risk_snapshot(account, positions)


@router.post("/api/risk/check")
async def run_risk_check() -> dict[str, Any]:
    """Force a risk check now (fires alerts if limits breached)."""
    from app.risk import check_risk

    fired = await check_risk()
    return {"fired": fired}


@router.post("/api/risk/kill-switch")
async def kill_switch(confirm: str = Query(default="")) -> dict[str, Any]:
    """EMERGENCY: market-close ALL open positions (reduce-only).

    Requires confirm=YES to prevent accidental invocation.
    """
    if confirm != "YES":
        raise HTTPException(
            400, "Pass ?confirm=YES to execute the kill switch"
        )
    adapter = get_execution_adapter()
    try:
        positions = await adapter.positions()
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Exchange error: {exc}") from exc

    closed: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    for p in positions:
        try:
            side = "SELL" if p["size"] > 0 else "BUY"
            result = await adapter.place_order(
                symbol=p["symbol"],
                side=side,
                order_type="MARKET",
                quantity=abs(p["size"]),
                reduce_only=True,
            )
            closed.append({"symbol": p["symbol"], "order_id": result["order_id"]})
            logger.warning("KILL SWITCH closed %s", p["symbol"])
        except Exception as exc:  # noqa: BLE001
            failed.append({"symbol": p["symbol"], "error": str(exc)})
            logger.error("KILL SWITCH failed for %s: %s", p["symbol"], exc)

    from app.alerts import dispatch_alert

    await dispatch_alert(
        "risk",
        {
            "message": f"🛑 KILL SWITCH: đóng {len(closed)} vị thế"
                       + (f", thất bại {len(failed)}" if failed else ""),
        },
    )
    return {"closed": closed, "failed": failed}


# --------------------------------------------------------------------- #
# Trade journal                                                          #
# --------------------------------------------------------------------- #


class JournalEntry(BaseModel):
    symbol: str
    side: str  # LONG | SHORT
    entry_price: float | None = None
    exit_price: float | None = None
    quantity: float | None = None
    setup: str = ""
    notes: str = ""
    pnl: float | None = None


@router.get("/api/journal")
async def get_journal(limit: int = Query(default=200, ge=1, le=1000)) -> list[dict[str, Any]]:
    from app.db import list_journal

    return list_journal(limit)


@router.post("/api/journal")
async def create_journal_entry(entry: JournalEntry) -> dict[str, Any]:
    from app.db import save_journal_entry

    saved = save_journal_entry(entry.model_dump())
    logger.info("JOURNAL ENTRY #%s: %s %s", saved["id"], saved["side"], saved["symbol"])
    return saved


@router.delete("/api/journal/{entry_id}")
async def remove_journal_entry(entry_id: int) -> dict[str, Any]:
    from app.db import delete_journal_entry

    if not delete_journal_entry(entry_id):
        raise HTTPException(404, "Journal entry not found")
    return {"ok": True}


# --------------------------------------------------------------------- #
# Auth (simple bearer token, optional)                                   #
# --------------------------------------------------------------------- #


@router.get("/api/auth/status")
async def auth_status() -> dict[str, Any]:
    """Whether the API is protected by a token."""
    from app.config import settings as s

    return {"protected": bool(s.api_token)}


@router.post("/api/auth/verify")
async def auth_verify(token: str = Query(default="")) -> dict[str, Any]:
    from app.config import settings as s

    if not s.api_token:
        return {"ok": True, "protected": False}
    return {"ok": token == s.api_token, "protected": True}


# --------------------------------------------------------------------- #
# Live candles (WS)                                                      #
# --------------------------------------------------------------------- #


@router.websocket("/ws/candles/{symbol}")
async def ws_candles(websocket: WebSocket, symbol: str, interval: str = "15m") -> None:
    """Stream live kline updates for one symbol (Binance kline stream)."""
    import asyncio
    import json as _json

    import websockets

    from app.adapters.binance import _ws_ssl_context

    await websocket.accept()
    stream = f"{symbol.lower()}@kline_{interval}"
    url = f"wss://stream.binance.com:9443/stream?streams={stream}"
    task = None
    try:
        async def _pump() -> None:
            while True:
                try:
                    async with websockets.connect(
                        url, ping_interval=20, ssl=_ws_ssl_context()
                    ) as upstream:
                        logger.info("Candle WS connected: %s", stream)
                        async for raw in upstream:
                            msg = _json.loads(raw)
                            k = msg.get("data", {}).get("k")
                            if not k:
                                continue
                            candle = {
                                "time": int(k["t"]) // 1000,
                                "open": float(k["o"]),
                                "high": float(k["h"]),
                                "low": float(k["l"]),
                                "close": float(k["c"]),
                                "volume": float(k["v"]),
                                "closed": bool(k["x"]),
                            }
                            await websocket.send_json(
                                {"type": "candle", "data": candle}
                            )
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Candle WS error (%s); reconnecting...", exc)
                    await asyncio.sleep(3)

        task = asyncio.create_task(_pump())
        # Keep the socket open until the client disconnects.
        while True:
            await websocket.receive_text()
    except Exception:  # noqa: BLE001 — client disconnected
        pass
    finally:
        if task:
            task.cancel()


@router.post("/api/reports/generate")
async def generate_report_endpoint(
    period: str = Query(default="daily", pattern="^(daily|weekly|monthly)$")
) -> dict[str, Any]:
    from app.reports import generate_report

    result = await generate_report(period)
    if result is None:
        raise HTTPException(400, "Report unavailable (API key not configured?)")
    return result


# --------------------------------------------------------------------- #
# Internal helper used by the background loop                            #
# --------------------------------------------------------------------- #


async def _tick_alert_checks(tickers: list[dict[str, Any]]) -> None:
    fired = await check_price_alerts(tickers)
    if fired:
        logger.info("Price alerts fired: %s", [a["id"] for a in fired])
