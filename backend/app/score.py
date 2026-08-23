"""Composite confluence score — one actionable number (0–100).

Aggregates every signal source already in the system:
  - MTF trend alignment          (weight 25)
  - Indicator consensus RSI/EMA/MACD/BB/VWAP   (weight 20)
  - Whale net flow               (weight 20)
  - CVD trend                    (weight 15)
  - Order-book imbalance         (weight 10)
  - Volatility sanity            (weight 10)

Score > 60 → long bias favourable; < 40 → short bias; else neutral.
"""
from __future__ import annotations

import statistics
import time
from typing import Any

from app.adapters import get_market_adapter
from app.indicators import bollinger, ema, latest, rsi, vwap

_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _clamp(v: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


async def confluence_score(symbol: str) -> dict[str, Any]:
    symbol = symbol.upper()
    now = time.time()
    hit = _cache.get(symbol)
    if hit and now - hit[0] < 30:
        return hit[1]

    adapter = get_market_adapter()
    parts: list[dict[str, Any]] = []

    # --- 1. MTF (weight 25) ------------------------------------------- #
    from app.mtf import mtf_trend

    mtf_pts = 12.5  # neutral default
    mtf_align = None
    try:
        mtf = await mtf_trend(symbol)
        mtf_align = mtf.get("alignment")
        bulls = sum(1 for r in mtf["timeframes"] if r["verdict"] == "bull")
        bears = sum(1 for r in mtf["timeframes"] if r["verdict"] == "bear")
        n = len(mtf["timeframes"]) or 1
        mtf_pts = ((bulls - bears) / n) * 12.5 + 12.5  # map to 0..25
    except Exception:  # noqa: BLE001
        pass
    parts.append({"name": "MTF Trend", "pts": round(mtf_pts, 1), "max": 25})

    # --- 2. Indicators (weight 20) ------------------------------------ #
    ind_pts = 10.0
    try:
        candles = await adapter.klines(symbol, "15m", 100)
        closes = [c["close"] for c in candles]
        last = closes[-1]
        votes = 0.0

        r14 = latest(rsi(closes, 14))
        if r14 is not None:
            # 30→+1, 70→-1 linear
            votes += _clamp((70 - r14) / 40)

        e9 = latest(ema(closes, 9))
        e21 = latest(ema(closes, 21))
        if e9 is not None and e21 is not None:
            votes += 1 if e9 > e21 else -1

        bb = bollinger(closes, 20, 2.0)
        up, lo = latest(bb["upper"]), latest(bb["lower"])
        if up and lo and up > lo:
            pos = (last - lo) / (up - lo)
            votes += _clamp((0.5 - pos) * 2)

        vw = latest(vwap(candles, rolling=20))
        if vw:
            votes += 1 if last < vw else -1

        ind_pts = ((votes / 4.0) * 10.0) + 10.0  # map to 0..20
    except Exception:  # noqa: BLE001
        pass
    parts.append({"name": "Indicators", "pts": round(ind_pts, 1), "max": 20})

    # --- 3. Whale flow (weight 20) ------------------------------------ #
    whale_pts = 10.0
    whale_flow = None
    try:
        trades = await adapter.recent_trades(symbol, 500)
        sized = [t["price"] * t["qty"] for t in trades]
        bigs = [
            (t["price"] * t["qty"], not t["is_buyer_maker"])
            for t in trades
            if t["price"] * t["qty"] >= 50_000
        ]
        if bigs:
            buy_n = sum(n for n, buy in bigs if buy)
            sell_n = sum(n for n, buy in bigs if not buy)
            total = buy_n + sell_n
            if total > 0:
                whale_flow = buy_n - sell_n
                whale_pts = _clamp(whale_flow / total) * 10 + 10
    except Exception:  # noqa: BLE001
        pass
    parts.append({"name": "Whales", "pts": round(whale_pts, 1), "max": 20})

    # --- 4. CVD (weight 15) ------------------------------------------- #
    cvd_pts = 7.5
    cvd_label = None
    try:
        import httpx

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://fapi.binance.com/fapi/v1/klines",
                params={"symbol": symbol, "interval": "5m", "limit": 24},
            )
        rows = resp.json()
        deltas = []
        for r in rows[-18:]:
            vol, tb = float(r[5]), float(r[9])
            deltas.append(tb - (vol - tb))
        if deltas:
            recent_sum = sum(deltas[-6:])
            older_sum = sum(deltas[:6]) or 1e-9
            ratio = _clamp(recent_sum / (abs(older_sum) + abs(recent_sum)) or 0)
            # rising CVD → bull points
            norm = _clamp(sum(deltas) / (sum(abs(d) for d in deltas) or 1))
            cvd_pts = norm * 7.5 + 7.5
            cvd_label = (
                "accumulation" if norm > 0.15 else ("distribution" if norm < -0.15 else "neutral")
            )
    except Exception:  # noqa: BLE001
        pass
    parts.append({"name": "CVD Flow", "pts": round(cvd_pts, 1), "max": 15})

    # --- 5. Order book imbalance (weight 10) -------------------------- #
    ob_pts = 5.0
    ob_imb = None
    try:
        ob = await adapter.order_book(symbol, 20)
        bv = sum(q for _, q in ob["bids"])
        av = sum(q for _, q in ob["asks"])
        if bv + av > 0:
            ob_imb = (bv - av) / (bv + av)
            ob_pts = _clamp(ob_imb * 2) * 5 + 5
    except Exception:  # noqa: BLE001
        pass
    parts.append({"name": "Book Balance", "pts": round(ob_pts, 1), "max": 10})

    # --- 6. Volatility sanity (weight 10) ------------------------------ #
    vol_pts = 5.0
    atr_pct = None
    try:
        candles = await adapter.klines(symbol, "15m", 20)
        trs = []
        for i in range(1, len(candles)):
            c, pc = candles[i], candles[i - 1]["close"]
            trs.append(max(c["high"] - c["low"], abs(c["high"] - pc), abs(c["low"] - pc)))
        atr = statistics.mean(trs[-14:])
        last = candles[-1]["close"]
        atr_pct = atr / last * 100
        # Sweet spot 0.3%–1.5% gets full points; extremes get less.
        if atr_pct < 0.15 or atr_pct > 2.5:
            vol_pts = 1.0
        elif atr_pct <= 1.5:
            vol_pts = 10.0
        else:
            vol_pts = 6.0
    except Exception:  # noqa: BLE001
        pass
    parts.append({"name": "Volatility", "pts": round(vol_pts, 1), "max": 10})

    score = round(sum(p["pts"] for p in parts), 1)
    if score >= 62:
        bias = "LONG FAVOURABLE"
    elif score >= 55:
        bias = "LEAN LONG"
    elif score <= 38:
        bias = "SHORT FAVOURABLE"
    elif score <= 45:
        bias = "LEAN SHORT"
    else:
        bias = "NEUTRAL"

    result = {
        "symbol": symbol,
        "score": score,
        "bias": bias,
        "mtf_alignment": mtf_align,
        "cvd": cvd_label,
        "whale_net_usd": round(whale_flow or 0),
        "book_imbalance": round(ob_imb, 3) if ob_imb is not None else None,
        "atr_pct": round(atr_pct, 3) if atr_pct else None,
        "parts": parts,
    }
    _cache[symbol] = (now, result)
    return result