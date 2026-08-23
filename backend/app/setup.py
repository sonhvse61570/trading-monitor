"""Trade setup generator — turns signals into an actionable plan.

For each direction (LONG/SHORT) evaluates confluence + structure and,
when conditions align, emits a complete plan:

  - entry: limit zone (pullback to EMA20 / pivot / VWAP)
  - stop_loss: ATR-based beyond structure
  - targets: TP1 1R, TP2 2R, TP3 3R
  - invalidation: what kills the setup
  - confidence: derived from confluence score
"""
from __future__ import annotations

import statistics
import time
from typing import Any

from app.adapters import get_market_adapter
from app.indicators import ema, latest, rsi, vwap

_cache: dict[str, tuple[float, dict[str, Any]]] = {}


async def _atr_pct(candles: list[dict[str, Any]], period: int = 14) -> float | None:
    if len(candles) < period + 1:
        return None
    trs = []
    for i in range(1, len(candles)):
        c, pc = candles[i], candles[i - 1]["close"]
        trs.append(max(c["high"] - c["low"], abs(c["high"] - pc), abs(c["low"] - pc)))
    atr = statistics.mean(trs[-period:])
    return atr / candles[-1]["close"]


async def generate_setup(symbol: str) -> dict[str, Any]:
    symbol = symbol.upper()
    now = time.time()
    hit = _cache.get(symbol)
    if hit and now - hit[0] < 60:
        return hit[1]

    adapter = get_market_adapter()
    from app.score import confluence_score

    conf = await confluence_score(symbol)
    score = conf["score"]

    candles = await adapter.klines(symbol, "15m", 120)
    closes = [c["close"] for c in candles]
    last = closes[-1]
    e20 = latest(ema(closes, 20))
    e50 = latest(ema(closes, 50))
    r14 = latest(rsi(closes, 14))
    vw = latest(vwap(candles, rolling=20))
    atr_pct = await _atr_pct(candles)

    setups: list[dict[str, Any]] = []

    # ---------- LONG setup ---------- #
    if score >= 55 and e20 is not None and e50 is not None and last > e50:
        atr = (atr_pct or 0.5) / 100 * last
        # Entry: pullback to EMA20 (or current if already there)
        entry_zone_hi = max(e20, last - atr * 0.5)
        entry_zone_lo = min(e20, last - atr * 0.8)
        entry_mid = (entry_zone_hi + entry_zone_lo) / 2
        sl = min(entry_zone_lo - atr * 0.8, e50 - atr * 0.3)
        risk = entry_mid - sl
        setups.append(
            {
                "side": "LONG",
                "confidence": min(95, int(score)),
                "status": (
                    "READY" if last <= entry_zone_hi * 1.002 else "WAIT_PULLBACK"
                ),
                "entry_zone": [round(entry_zone_lo, 4), round(entry_zone_hi, 4)],
                "stop_loss": round(sl, 4),
                "targets": [
                    {"label": "TP1", "price": round(entry_mid + risk, 4), "r": 1},
                    {"label": "TP2", "price": round(entry_mid + risk * 2, 4), "r": 2},
                    {"label": "TP3", "price": round(entry_mid + risk * 3, 4), "r": 3},
                ],
                "invalidation": f"Giá đóng nến 15m dưới {round(sl, 2)} hoặc MTF mất đồng thuận bull",
                "notes": [
                    f"Confluence {score}/100 ({conf['bias']})",
                    f"MTF: {conf.get('mtf_alignment')}",
                    f"CVD: {conf.get('cvd')}",
                    f"ATR 15m: {(atr_pct or 0):.2f}% giá",
                ],
            }
        )

    # ---------- SHORT setup ---------- #
    if score <= 45 and e20 is not None and e50 is not None and last < e50:
        atr = (atr_pct or 0.5) / 100 * last
        entry_zone_lo = min(e20, last + atr * 0.5)
        entry_zone_hi = max(e20, last + atr * 0.8)
        entry_mid = (entry_zone_hi + entry_zone_lo) / 2
        sl = max(entry_zone_hi + atr * 0.8, e50 + atr * 0.3)
        risk = sl - entry_mid
        setups.append(
            {
                "side": "SHORT",
                "confidence": min(95, int(100 - score)),
                "status": (
                    "READY" if last >= entry_zone_lo * 0.998 else "WAIT_PULLBACK"
                ),
                "entry_zone": [round(entry_zone_lo, 4), round(entry_zone_hi, 4)],
                "stop_loss": round(sl, 4),
                "targets": [
                    {"label": "TP1", "price": round(entry_mid - risk, 4), "r": 1},
                    {"label": "TP2", "price": round(entry_mid - risk * 2, 4), "r": 2},
                    {"label": "TP3", "price": round(entry_mid - risk * 3, 4), "r": 3},
                ],
                "invalidation": f"Giá đóng nến 15m trên {round(sl, 2)} hoặc MTF mất đồng thuận bear",
                "notes": [
                    f"Confluence {score}/100 ({conf['bias']})",
                    f"MTF: {conf.get('mtf_alignment')}",
                    f"CVD: {conf.get('cvd')}",
                    f"RSI: {r14:.1f}" if r14 else "",
                ],
            }
        )

    result = {
        "symbol": symbol,
        "score": score,
        "bias": conf["bias"],
        "last_price": last,
        "setups": setups,
        "no_setup_reason": (
            None
            if setups
            else (
                f"Score {score} ở vùng trung lập (45-55) — chờ tín hiệu rõ hơn."
                if 45 <= score <= 55
                else f"Score {score} nhưng cấu trúc giá chưa hỗ trợ (giá vs EMA50)."
            )
        ),
    }
    _cache[symbol] = (now, result)
    return result