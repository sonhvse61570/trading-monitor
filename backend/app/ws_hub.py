"""WebSocket hub — broadcasts live ticker updates to all connected clients.

A single upstream connection to Binance feeds every browser client,
so we never open one exchange socket per user.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)

DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]


class WSHub:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self._upstream_task: asyncio.Task | None = None
        self._adapter = None

    async def register(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)
        logger.info("Client connected (%d total)", len(self._clients))

    async def unregister(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)
        logger.info("Client disconnected (%d total)", len(self._clients))

    async def broadcast(self, message: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._clients):
            try:
                await ws.send_json(message)
            except Exception:  # noqa: BLE001
                dead.append(ws)
        for ws in dead:
            await self.unregister(ws)

    async def start(self) -> None:
        """Start the upstream Binance stream (idempotent)."""
        if self._upstream_task and not self._upstream_task.done():
            return
        from app.adapters import get_market_adapter

        self._adapter = get_market_adapter()

        async def _pump() -> None:
            async for tick in self._adapter.stream_tickers(DEFAULT_SYMBOLS):
                await self.broadcast({"type": "ticker", "data": tick})
                # Feed price-alert checker with every live tick.
                from app.routes_phase2 import _tick_alert_checks

                await _tick_alert_checks([tick])

        self._upstream_task = asyncio.create_task(_pump())
        logger.info("Upstream ticker stream started")

    async def stop(self) -> None:
        if self._upstream_task:
            self._upstream_task.cancel()
        if self._adapter:
            await self._adapter.close()


hub = WSHub()