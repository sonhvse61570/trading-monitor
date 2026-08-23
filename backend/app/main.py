"""FastAPI application entrypoint."""
from __future__ import annotations

import asyncio
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.config import settings
from app.routes import router
from app.routes_phase2 import router as router_phase2, _tick_alert_checks
from app.routes_phase3 import router as router_phase3
from app.strategies import run_scan_once
from app.ws_hub import hub

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)  # domain routers: analysis + intel
app.include_router(router)
app.include_router(router_phase2)
app.include_router(router_phase3)


@app.middleware("http")
async def auth_middleware(request, call_next):
    """Optional bearer-token auth for /api/* (skips health & auth endpoints)."""
    from app.config import settings as s

    token = s.api_token
    if token:
        path = request.url.path
        is_exempt = (
            path == "/api/health"
            or path.startswith("/api/auth/")
            or not path.startswith("/api/")
        )
        if not is_exempt:
            auth = request.headers.get("authorization", "")
            if auth != f"Bearer {token}":
                from fastapi.responses import JSONResponse

                return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return await call_next(request)


@app.on_event("startup")
async def startup() -> None:
    from app.alerts import load_alerts_from_db
    from app.autotrader import background_autotrade_loop
    from app.config import settings as s
    from app.db import init_db

    init_db()
    load_alerts_from_db()
    await hub.start()
    asyncio.create_task(_background_loop())
    asyncio.create_task(background_autotrade_loop())
    if s.autotrade_enabled:
        logger.warning("AUTOTRADE enabled via env — engine will trade live!")


@app.on_event("shutdown")
async def shutdown() -> None:
    await hub.stop()


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await hub.register(ws)
    try:
        while True:
            # Keep the connection alive; clients may send pings.
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await hub.unregister(ws)


async def _background_loop() -> None:
    """Periodically: strategy scan + price alerts + risk checks + daily report."""
    symbols = [s.strip().upper() for s in settings.scan_symbols.split(",")]
    last_report_day: int | None = None
    while True:
        try:
            await asyncio.sleep(settings.scan_interval_seconds)

            new_signals = await run_scan_once(symbols)
            for sig in new_signals:
                from app.alerts import dispatch_alert

                await hub.broadcast({"type": "signal", "data": sig})
                await dispatch_alert("signal", sig)
            if new_signals:
                logger.info("Strategy scan produced %d signals", len(new_signals))

            from app.risk import check_risk

            fired = await check_risk()
            if fired:
                logger.warning("Risk warnings fired: %s", [w["rule"] for w in fired])

            # Trailing stops (protect profits on open positions).
            if settings.trailing_enabled:
                from app.trailing import manage_trailing_stops

                moved = await manage_trailing_stops()
                if moved:
                    logger.info("Trailing SLs moved: %s",
                                [(m["symbol"], m["new_sl"]) for m in moved])

            # Daily report once per UTC day (if Telegram configured).
            import time

            today = int(time.time() // 86400)
            if last_report_day is None:
                last_report_day = today  # skip first cycle after boot
            elif today != last_report_day:
                last_report_day = today
                try:
                    from app.reports import generate_report

                    result = await generate_report("daily")
                    if result:
                        logger.info("Daily report sent: %s", result["sent"])
                except Exception:  # noqa: BLE001
                    logger.exception("Daily report failed")
        except Exception:  # noqa: BLE001 — the loop must never die
            logger.exception("Background loop iteration failed")
