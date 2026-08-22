"""Abstract adapter interfaces.

Every exchange/market implements these two protocols so the rest of the
app never talks to a specific venue directly (Adapter Pattern).
"""
from abc import ABC, abstractmethod
from typing import Any, AsyncIterator


class MarketDataAdapter(ABC):
    """Read-only market data: tickers, klines, order book, trades."""

    @abstractmethod
    async def ticker(self, symbol: str) -> dict[str, Any]: ...

    @abstractmethod
    async def tickers(self) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def klines(
        self, symbol: str, interval: str, limit: int = 200
    ) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def order_book(self, symbol: str, limit: int = 20) -> dict[str, Any]: ...

    @abstractmethod
    async def recent_trades(self, symbol: str, limit: int = 50) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def stream_tickers(self, symbols: list[str]) -> AsyncIterator[dict[str, Any]]:
        """Yield live ticker updates as they arrive over WebSocket."""


class ExecutionAdapter(ABC):
    """Account & trading: balances, positions, orders."""

    @abstractmethod
    async def account(self) -> dict[str, Any]:
        """Balances / account overview."""

    @abstractmethod
    async def positions(self) -> list[dict[str, Any]]:
        """Currently open positions with unrealized PnL."""

    @abstractmethod
    async def open_orders(self) -> list[dict[str, Any]]:
        """Pending (unfilled) orders."""

    @abstractmethod
    async def order_history(self, limit: int = 50) -> list[dict[str, Any]]:
        """Recent filled/cancelled orders."""

    @abstractmethod
    async def place_order(
        self,
        symbol: str,
        side: str,
        order_type: str,
        quantity: float | None = None,
        price: float | None = None,
        stop_price: float | None = None,
        reduce_only: bool = False,
    ) -> dict[str, Any]: ...

    @abstractmethod
    async def cancel_order(self, symbol: str, order_id: str) -> dict[str, Any]: ...