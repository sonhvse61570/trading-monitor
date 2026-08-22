"""Backtester for registered strategies.

Runs a strategy over historical candles and simulates fills at the next
candle open after each signal. Includes a cost model (taker fee per side
+ optional slippage bps).

When a signal carries stop_loss / take_profit, exits are simulated
intra-candle: if both levels fall inside one candle's range, the STOP is
assumed to hit first (conservative).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.config import settings
from app.strategies import STRATEGIES, Strategy


@dataclass
class BacktestResult:
    strategy: str
    symbol: str
    interval: str
    candles_tested: int
    trades: list[dict[str, Any]] = field(default_factory=list)
    fee_rate: float = 0.0  # fraction, e.g. 0.0005

    @property
    def total_fees(self) -> float:
        return sum(t["fees"] for t in self.trades)

    @property
    def total_pnl_net(self) -> float:
        return sum(t["pnl"] - t["fees"] for t in self.trades)

    @property
    def total_pnl_gross(self) -> float:
        return sum(t["pnl"] for t in self.trades)

    @property
    def win_rate(self) -> float | None:
        if not self.trades:
            return None
        wins = sum(1 for t in self.trades if t["pnl"] - t["fees"] > 0)
        return round(wins / len(self.trades) * 100, 2)

    @property
    def max_drawdown_pct(self) -> float:
        peak = 0.0
        max_dd = 0.0
        cum = 0.0
        for t in self.trades:
            cum += t["pnl"] - t["fees"]
            peak = max(peak, cum)
            dd = peak - cum
            if peak > 0 and dd > max_dd:
                max_dd = dd
        return round(max_dd / peak * 100, 2) if peak > 0 else 0.0

    @property
    def profit_factor(self) -> float | None:
        wins = [t["pnl"] - t["fees"] for t in self.trades if t["pnl"] - t["fees"] > 0]
        losses = [abs(t["pnl"] - t["fees"]) for t in self.trades if t["pnl"] - t["fees"] <= 0]
        gross_win = sum(wins)
        gross_loss = sum(losses)
        if gross_loss == 0:
            return None
        return round(gross_win / gross_loss, 3)

    @property
    def sharpe(self) -> float | None:
        """Per-trade Sharpe (annualization depends on trade frequency)."""
        import math

        rets = [t["pnl"] - t["fees"] for t in self.trades]
        n = len(rets)
        if n < 2:
            return None
        mean = sum(rets) / n
        var = sum((r - mean) ** 2 for r in rets) / (n - 1)
        std = math.sqrt(var)
        if std == 0:
            return None
        return round(mean / std * math.sqrt(n), 3)

    @property
    def avg_r_multiple(self) -> float | None:
        """Average R achieved per trade (needs SL on signals)."""
        rs = [
            t["r_multiple"]
            for t in self.trades
            if t.get("r_multiple") is not None
        ]
        if not rs:
            return None
        return round(sum(rs) / len(rs), 3)

    def to_dict(self) -> dict[str, Any]:
        return {
            "strategy": self.strategy,
            "symbol": self.symbol,
            "interval": self.interval,
            "candles_tested": self.candles_tested,
            "total_trades": len(self.trades),
            "total_pnl": round(self.total_pnl_net, 4),
            "total_pnl_gross": round(self.total_pnl_gross, 4),
            "total_fees": round(self.total_fees, 4),
            "fee_rate_pct": round(self.fee_rate * 100, 4),
            "win_rate": self.win_rate,
            "profit_factor": self.profit_factor,
            "sharpe": self.sharpe,
            "avg_r": self.avg_r_multiple,
            "max_drawdown_pct": self.max_drawdown_pct,
            "trades": self.trades[:100],
        }


def run_backtest(
    strategy_name: str,
    candles: list[dict[str, Any]],
    symbol: str,
    interval: str,
    fee_rate: float | None = None,
    slippage_bps: float = 0.0,
) -> BacktestResult:
    strat: Strategy = STRATEGIES[strategy_name]
    fee = fee_rate if fee_rate is not None else settings.taker_fee_pct / 100
    result = BacktestResult(
        strategy=strategy_name, symbol=symbol, interval=interval,
        candles_tested=len(candles), fee_rate=fee,
    )

    def _fill(price: float, side_dir: int) -> float:
        """Apply slippage against the trade direction."""
        return price * (1 + side_dir * slippage_bps / 10_000)

    position: dict[str, Any] | None = None

    def _close(exit_price: float, exit_time: int, note: str = "") -> None:
        nonlocal position
        assert position is not None
        direction = 1 if position["side"] == "LONG" else -1
        pnl = (exit_price - position["entry"]) * direction
        fees = (position["entry"] + exit_price) * fee
        risk = position.get("risk_per_unit")
        r_mult = (
            round(pnl / risk, 3)
            if risk and risk > 0
            else None
        )
        result.trades.append(
            {
                "side": position["side"],
                "entry": position["entry"],
                "exit": exit_price,
                "pnl": round(pnl, 6),
                "fees": round(fees, 6),
                "r_multiple": r_mult,
                "entry_time": position["entry_time"],
                "exit_time": exit_time,
                "exit_reason": position.get("exit_reason", note),
                **({"note": note} if note else {}),
            }
        )
        position = None

    for i in range(len(candles)):
        candle = candles[i]
        next_open = candles[i + 1]["open"] if i + 1 < len(candles) else None

        # --- 1. Manage open position: check SL/TP intra-candle first ---
        if position is not None:
            direction = 1 if position["side"] == "LONG" else -1
            sl = position.get("stop_loss")
            tp = position.get("take_profit")
            low, high = candle["low"], candle["high"]

            hit_sl = sl is not None and (
                (direction == 1 and low <= sl) or (direction == -1 and high >= sl)
            )
            hit_tp = tp is not None and (
                (direction == 1 and high >= tp) or (direction == -1 and low <= tp)
            )
            # Conservative: assume SL hits before TP when both in same candle.
            if hit_sl:
                position["exit_reason"] = "stop_loss"
                _close(sl, candle["time"])
            elif hit_tp:
                position["exit_reason"] = "take_profit"
                _close(tp, candle["time"])

        # --- 2. Evaluate strategy on window ending at this candle ---
        sig = strat.evaluate(symbol, candles[: i + 1])
        if sig is None or next_open is None:
            continue

        if sig.side in ("LONG", "SHORT") and position is None:
            direction = 1 if sig.side == "LONG" else -1
            entry = _fill(next_open, direction)
            position = {
                "side": sig.side,
                "entry": entry,
                "entry_time": candle["time"],
                "stop_loss": sig.stop_loss,
                "take_profit": sig.take_profit,
                # Initial risk per unit (for R-multiple calc at close).
                "risk_per_unit": (
                    abs(entry - sig.stop_loss) if sig.stop_loss else None
                ),
            }
        elif sig.side == "EXIT" and position is not None:
            direction = 1 if position["side"] == "LONG" else -1
            exit_price = _fill(next_open, -direction)
            position["exit_reason"] = "signal_exit"
            _close(exit_price, candle["time"])

    # Close any dangling position at the last close
    if position is not None and candles:
        last = candles[-1]
        position["exit_reason"] = "end_of_data"
        _close(last["close"], last["time"])

    return result