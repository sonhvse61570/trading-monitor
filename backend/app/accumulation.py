"""Stealth accumulation detector — find coins whales are quietly loading.

Composite of classic Wyckoff accumulation signatures computed from
public data per symbol:

  1. CVD/price divergence  — taker buys rising while price flat
                             (absorption)                    weight 30
  2. Open interest rising  — positions being built          weight 20
  3. Volume expansion      — activity up, price quiet       weight 20
  4. Whale net flow        — large prints skewing buy        weight 20
  5. Funding not hot       — crowd hasn't piled in yet
                             (still stealth)                 weight 10

Score ≥ 60 → likely stealth accumulation zone.
"""
from __future__ import annotations

import asyncio
import statistics
import time
from typing import Any

import httpx

from app.adapters import get_market_adapter

_cache: tuple[float, list[dict[str, Any]]] | None = None

FUTURES = "https://fapi.binance.com"


async def _scan_one(sym: str, ticker: dict[str, Any]) -> dict[str, Any] | None:
    adapter = get_market_adapter()
    try:
        candles = await adapter.klines(sym, "15m", 60)
        closes = [c["close"] for c in candles]
        if len(closes) < 40:
            return None

        # --- 1. CVD vs price divergence (weight 30) --- #
        # Fetch taker-buy volumes straight from Binance (adapter
        # klines may not carry them).
        deltas: list[float] = []
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    f"{FUTURES}/fapi/v1/klines",
                    params={"symbol": sym, "interval": "15m", "limit": 60},
                )
            for row in r.json():
                vol, tb = float(row[5]), float(row[9])
                deltas.append(tb - (vol - tb))
        except Exception:  # noqa: BLE001
            deltas = [0.0] * len(candles)
        recent_cvd = sum(deltas[-12:])
        prior_cvd = sum(deltas[-24:-12]) or 1e-9
        cvd_mom = (recent_cvd - prior_cvd) / (abs(prior_cvd) + abs(recent_cvd))
        price_chg = (closes[-1] - closes[-12]) / closes[-12]
        # Divergence: CVD strongly positive while price move small.
        divergence = max(0.0, cvd_mom - max(price_chg, 0) * 3)
        div_pts = min(30.0, divergence * 30)

        # --- 2. OI rising (weight 20) --- #
        oi_pts = 0.0
        oi_chg = None
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(
                    f"{FUTURES}/futures/data/openInterestHist",
                    params={"symbol": sym, "period": "1h", "limit": 12},
                )
                rows = r.json()
            if isinstance(rows, list) and len(rows) >= 6:
                first, last = float(rows[0]["sumOpenInterest"]), float(rows[-1]["sumOpenInterest"])
                if first > 0:
                    oi_chg = round((last - first) / first * 100, 2)
                    oi_pts = min(20.0, max(0.0, oi_chg * 5))  # +4%/6h → full
        except Exception:  # noqa: BLE001
            pass

        # --- 3. Volume expansion with quiet price (weight 20) --- #
        vols = [c["volume"] for c in candles]
        rel_vol = vols[-1] / (statistics.mean(vols[-21:-1]) or 1)
        range_pct = (max(c["high"] for c in candles[-12:]) - min(c["low"] for c in candles[-12:])) / closes[-1]
        vol_pts = 0.0
        if rel_vol > 1.2 and range_pct < 0.03:  # active but tight range
            vol_pts = min(20.0, (rel_vol - 1.0) * 20)

        # --- 4. Whale net flow (weight 20) --- #
        whale_pts = 0.0
        whale_net = None
        try:
            trades = await adapter.recent_trades(sym, 300)
            bigs = [
                (t["price"] * t["qty"], not t["is_buyer_maker"])
                for t in trades
                if t["price"] * t["qty"] >= 20_000
            ]
            if bigs:
                buy_n = sum(n for n, b in bigs if b)
                sell_n = sum(n for n, b in bigs if not b)
                total = buy_n + sell_n
                if total:
                    whale_net = round(buy_n - sell_n)
                    whale_pts = min(20.0, max(0.0, ((buy_n / total) - 0.5) * 80))
        except Exception:  # noqa: BLE001
            pass

        # --- 5. Funding still cool (weight 10) --- #
        fund_pts = 0.0
        funding = None
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(
                    f"{FUTURES}/fapi/v1/premiumIndex", params={"symbol": sym}
                )
                funding = float(r.json()["lastFundingRate"]) * 100
            # Neutral-to-negative funding = stealth intact.
            if funding <= 0.02:
                fund_pts = 10.0
            elif funding <= 0.05:
                fund_pts = 5.0
        except Exception:  # noqa: BLE001
            pass

        score = round(div_pts + oi_pts + vol_pts + whale_pts + fund_pts, 1)
        if score < 35:
            return None  # not interesting

        return {
            "symbol": sym,
            "price": ticker["last_price"],
            "change_pct": ticker["change_pct"],
            "score": score,
            "cvd_momentum": round(cvd_mom, 3),
            "price_change_3h_pct": round(price_chg * 100, 2),
            "oi_change_6h_pct": oi_chg,
            "rel_volume": round(rel_vol, 2),
            "range_3h_pct": round(range_pct * 100, 2),
            "whale_net_usd": whale_net,
            "funding_pct": round(funding, 4) if funding is not None else None,
            "signals": {
                "absorption": div_pts >= 15,
                "oi_building": oi_pts >= 10,
                "quiet_volume": vol_pts >= 10,
                "whale_buying": whale_pts >= 10,
                "funding_cool": fund_pts >= 10,
            },
        }
    except Exception:  # noqa: BLE001
        return None


async def scan_accumulation(top: int = 20) -> dict[str, Any]:
    global _cache
    now = time.time()
    if _cache and now - _cache[0] < 180:
        return {"count": len(_cache[1]), "rows": _cache[1][:top]}

    adapter = get_market_adapter()
    try:
        tickers = await adapter.tickers()
    except Exception as exc:  # noqa: BLE001
        return {"count": 0, "rows": [], "error": str(exc)}

    candidates = [
        t
        for t in tickers
        if t["symbol"].endswith("USDT") and t.get("quote_volume", 0) > 10_000_000
    ]
    candidates.sort(key=lambda t: -t.get("quote_volume", 0))
    candidates = candidates[:top]

    results = await asyncio.gather(
        *(_scan_one(t["symbol"], t) for t in candidates)
    )
    rows = sorted(
        (r for r in results if r is not None),
        key=lambda r: -r["score"],
    )
    _cache = (now, rows)
    return {"count": len(rows), "rows": rows}