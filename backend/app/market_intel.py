"""Market intelligence — news, economic calendar, sentiment.

All sources are free & keyless; responses are cached in-memory with TTLs
to stay polite and fast.
"""
from __future__ import annotations

import logging
import time
import xml.etree.ElementTree as ET
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_cache: dict[str, tuple[float, Any]] = {}


def _cached(key: str, ttl_seconds: int):
    def decorator(fn):
        async def wrapper(*args, **kwargs):
            now = time.time()
            hit = _cache.get(key)
            if hit and now - hit[0] < ttl_seconds:
                return hit[1]
            try:
                data = await fn(*args, **kwargs)
                _cache[key] = (now, data)
                return data
            except Exception as exc:  # noqa: BLE001 — serve stale on failure
                logger.warning("intel %s failed: %s", key, exc)
                return hit[1] if hit else []
        return wrapper
    return decorator


# --------------------------------------------------------------------- #
# News (CoinDesk + Cointelegraph RSS)                                    #
# --------------------------------------------------------------------- #

FEEDS = [
    ("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    ("Cointelegraph", "https://cointelegraph.com/rss"),
]


@_cached("news", ttl_seconds=300)
async def fetch_news(limit: int = 20) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:

        async def grab(source: str, url: str) -> None:
            resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            root = ET.fromstring(resp.text)
            for item in root.iter("item"):
                title = (item.findtext("title") or "").strip()
                link = (item.findtext("link") or "").strip()
                pub = item.findtext("pubDate") or ""
                desc = (item.findtext("description") or "").strip()[:200]
                if title:
                    items.append(
                        {
                            "source": source,
                            "title": title,
                            "link": link,
                            "published": pub,
                            "summary": desc,
                        }
                    )

        import asyncio

        await asyncio.gather(
            *(grab(s, u) for s, u in FEEDS), return_exceptions=True
        )

    # Sort newest first by parsing RFC822 dates loosely.
    import email.utils

    def ts(it: dict[str, Any]) -> float:
        try:
            return email.utils.parsedate_to_datetime(it["published"]).timestamp()
        except Exception:  # noqa: BLE001
            return 0.0

    items.sort(key=ts, reverse=True)
    return items[:limit]


# --------------------------------------------------------------------- #
# Economic calendar (ForexFactory weekly JSON)                           #
# --------------------------------------------------------------------- #

FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"


@_cached("calendar", ttl_seconds=1800)
async def fetch_calendar(impact_min: str = "high") -> list[dict[str, Any]]:
    """impact_min: 'low' | 'medium' | 'high' — minimum impact to include."""
    rank = {"low": 1, "medium": 2, "high": 3}
    min_rank = rank.get(impact_min, 3)

    async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
        resp = await client.get(
            FF_URL, headers={"User-Agent": "Mozilla/5.0"}
        )
        resp.raise_for_status()
        raw = resp.json()

    events = []
    for e in raw:
        impact = str(e.get("impact", "")).lower()
        if rank.get(impact, 0) < min_rank:
            continue
        events.append(
            {
                "date": e.get("date", ""),
                "country": e.get("country", ""),
                "currency": e.get("currency", ""),
                "event": e.get("title", ""),
                "impact": impact,
                "forecast": e.get("forecast", ""),
                "previous": e.get("previous", ""),
            }
        )
    events.sort(key=lambda x: x["date"])
    return events[:60]


# --------------------------------------------------------------------- #
# Fear & Greed Index (alternative.me)                                    #
# --------------------------------------------------------------------- #


@_cached("fng", ttl_seconds=600)
async def fetch_fear_greed() -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=12) as client:
        resp = await client.get("https://api.alternative.me/fng/?limit=8")
        resp.raise_for_status()
        data = resp.json().get("data", [])

    if not data:
        return {}
    current = data[0]
    return {
        "value": int(current["value"]),
        "label": current["value_classification"],
        "history": [
            {"ts": int(d["timestamp"]), "value": int(d["value"])}
            for d in reversed(data)
        ],
    }