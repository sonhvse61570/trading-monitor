"""Adapter registry — single place to resolve adapters by venue name."""
from __future__ import annotations

from app.adapters.base import ExecutionAdapter, MarketDataAdapter
from app.adapters.binance import BinanceFuturesAdapter
from app.adapters.bybit import BybitAdapter
from app.adapters.bybit_exec import BybitExecutionAdapter
from app.adapters.okx import OkxAdapter
from app.adapters.okx_exec import OkxExecutionAdapter

# venue -> factory. Add new exchanges here.
_MARKET_ADAPTERS: dict[str, type[MarketDataAdapter]] = {
    "binance": BinanceFuturesAdapter,
    "okx": OkxAdapter,
    "bybit": BybitAdapter,
}

_EXECUTION_ADAPTERS: dict[str, type[ExecutionAdapter]] = {
    "binance": BinanceFuturesAdapter,
    "okx": OkxExecutionAdapter,
    "bybit": BybitExecutionAdapter,
}


def get_market_adapter(venue: str = "binance") -> MarketDataAdapter:
    try:
        return _MARKET_ADAPTERS[venue]()
    except KeyError:
        raise ValueError(f"Unknown venue: {venue}") from None


def get_execution_adapter(venue: str = "binance") -> ExecutionAdapter:
    try:
        return _EXECUTION_ADAPTERS[venue]()
    except KeyError:
        raise ValueError(f"Unknown venue: {venue}") from None


def list_venues() -> list[dict[str, str]]:
    return [
        {"venue": v, "market": cls.__doc__ or cls.__name__}
        for v, cls in _MARKET_ADAPTERS.items()
    ]