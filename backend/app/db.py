"""SQLite persistence — signals & price alerts survive restarts.

Uses the stdlib sqlite3 module (WAL mode, single writer) — good enough
for a single-user monitoring app. Swap for Postgres later if needed.
"""
from __future__ import annotations

import json
import logging
import sqlite3
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent / "data" / "trading_monitor.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts INTEGER NOT NULL,
                strategy TEXT NOT NULL,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                reason TEXT,
                price REAL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS price_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                op TEXT NOT NULL,
                price REAL NOT NULL,
                triggered INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_signals_ts ON signals(ts DESC)"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS journal (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                side TEXT NOT NULL,
                entry_price REAL,
                exit_price REAL,
                quantity REAL,
                setup TEXT,
                notes TEXT,
                pnl REAL
            )
            """
        )
    logger.info("DB ready at %s", DB_PATH)


# --------------------------------------------------------------------- #
# Signals                                                                #
# --------------------------------------------------------------------- #


def save_signal(sig: dict[str, Any]) -> dict[str, Any]:
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO signals (ts, strategy, symbol, side, reason, price) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                sig.get("ts", int(time.time() * 1000)),
                sig["strategy"],
                sig["symbol"],
                sig["side"],
                sig.get("reason", ""),
                sig.get("price", 0),
            ),
        )
        sig = {**sig, "id": cur.lastrowid}
    return sig


def load_signals(limit: int = 100) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM signals ORDER BY ts DESC, id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


# --------------------------------------------------------------------- #
# Price alerts                                                           #
# --------------------------------------------------------------------- #


def save_price_alert(alert: dict[str, Any]) -> dict[str, Any]:
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO price_alerts (symbol, op, price, triggered, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                alert["symbol"],
                alert["op"],
                alert["price"],
                0,
                int(time.time() * 1000),
            ),
        )
        alert = {**alert, "id": cur.lastrowid}
    return alert


def load_price_alerts(include_triggered: bool = True) -> list[dict[str, Any]]:
    q = "SELECT * FROM price_alerts"
    if not include_triggered:
        q += " WHERE triggered = 0"
    with _connect() as conn:
        rows = conn.execute(q + " ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def mark_alert_triggered(alert_id: int) -> None:
    with _connect() as conn:
        conn.execute(
            "UPDATE price_alerts SET triggered = 1 WHERE id = ?", (alert_id,)
        )


def delete_price_alert(alert_id: int) -> bool:
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM price_alerts WHERE id = ?", (alert_id,)
        )
        return cur.rowcount > 0


# --------------------------------------------------------------------- #
# Trade journal                                                          #
# --------------------------------------------------------------------- #


def save_journal_entry(entry: dict[str, Any]) -> dict[str, Any]:
    entry = {**entry, "created_at": int(time.time() * 1000)}
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO journal (created_at, symbol, side, entry_price, "
            "exit_price, quantity, setup, notes, pnl) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                entry["created_at"],
                entry["symbol"].upper(),
                entry["side"],
                entry.get("entry_price"),
                entry.get("exit_price"),
                entry.get("quantity"),
                entry.get("setup", ""),
                entry.get("notes", ""),
                entry.get("pnl"),
            ),
        )
        entry["id"] = cur.lastrowid
    return entry


def list_journal(limit: int = 200) -> list[dict[str, Any]]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM journal ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def delete_journal_entry(entry_id: int) -> bool:
    with _connect() as conn:
        cur = conn.execute("DELETE FROM journal WHERE id = ?", (entry_id,))
        return cur.rowcount > 0
