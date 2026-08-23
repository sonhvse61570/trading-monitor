"use client";

// 🔍 Screener — rich market-wide ranking with sortable columns.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/components/Watchlist";

interface Row {
  symbol: string;
  price: number;
  change_pct: number;
  quote_volume_m: number;
  score: number;
  bias: string;
  mtf: string | null;
  cvd: string | null;
  rsi: number | null;
  trend_ema: string | null;
  atr_pct: number | null;
  rel_vol: number | null;
  funding_pct: number | null;
  oi_change_6h_pct: number | null;
}

type SortKey =
  | "score"
  | "change_pct"
  | "quote_volume_m"
  | "rsi"
  | "atr_pct"
  | "rel_vol"
  | "funding_pct"
  | "oi_change_6h_pct";

const BIAS_CLS: Record<string, string> = {
  "LONG FAVOURABLE": "bg-up text-black",
  "LEAN LONG": "bg-up/20 text-up",
  NEUTRAL: "bg-accent/15 text-accent",
  "LEAN SHORT": "bg-down/20 text-down",
  "SHORT FAVOURABLE": "bg-down text-white",
};

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "score", label: "Score", title: "Confluence score tổng hợp" },
  { key: "change_pct", label: "24h %", title: "Thay đổi giá 24h" },
  { key: "quote_volume_m", label: "Vol $M", title: "Volume 24h (triệu $)" },
  { key: "rsi", label: "RSI", title: "RSI 14 trên 15m" },
  { key: "atr_pct", label: "ATR%", title: "Biên độ trung bình 14 nến (% giá)" },
  { key: "rel_vol", label: "R-Vol", title: "Volume nến hiện tại / TB 20 nến" },
  { key: "funding_pct", label: "Funding%", title: "Funding rate hiện tại" },
  { key: "oi_change_6h_pct", label: "OI 6h%", title: "Open Interest thay đổi 6h" },
];

export default function ScreenerPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "long" | "short">("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [asc, setAsc] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/screener?top=25").then((x) => x.json());
        if (!cancelled) setRows(r.rows ?? []);
      } catch {
        /* keep old */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 180000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const filtered = useMemo(() => {
    const f = rows.filter((r) =>
      filter === "all" ? true : filter === "long" ? r.score >= 55 : r.score <= 45
    );
    return [...f].sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return asc ? av - bv : bv - av;
    });
  }, [rows, filter, sortKey, asc]);

  function clickSort(k: SortKey) {
    if (k === sortKey) setAsc(!asc);
    else {
      setSortKey(k);
      setAsc(false);
    }
  }

  return (
    <main className="min-h-screen bg-bg p-4 sm:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href="/"
          className="rounded border border-bg-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
        >
          ← Dashboard
        </Link>
        <h1 className="text-lg font-bold">🔍 Market Screener</h1>
        <span className="rounded bg-bg-panel px-2 py-1 text-[10px] text-muted">
          Top liquid perps · refresh 3m · click header để sort
        </span>
        <div className="ml-auto flex gap-1">
          {(
            [
              ["all", "Tất cả"],
              ["long", "Long ≥55"],
              ["short", "Short ≤45"],
            ] as ["all" | "long" | "short", string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`rounded px-2.5 py-1 text-xs ${
                filter === id
                  ? "bg-accent/20 font-semibold text-accent"
                  : "border border-bg-border text-muted hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-bg-border bg-bg-panel">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-bg-border text-left text-[10px] uppercase text-muted">
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2 text-right">Giá</th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  title={c.title}
                  onClick={() => clickSort(c.key)}
                  className={`cursor-pointer select-none px-3 py-2 text-right hover:text-white ${
                    sortKey === c.key ? "text-accent" : ""
                  }`}
                >
                  {c.label}
                  {sortKey === c.key && (asc ? " ▲" : " ▼")}
                </th>
              ))}
              <th className="px-3 py-2">Bias</th>
              <th className="px-3 py-2">MTF</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={15} className="px-4 py-10 text-center text-muted">
                  Đang quét thị trường (chấm điểm từng symbol)...
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={15} className="px-4 py-10 text-center text-muted">
                  Không có setup nào khớp bộ lọc.
                </td>
              </tr>
            )}
            {filtered.map((r, i) => (
              <tr
                key={r.symbol}
                className="border-b border-bg-border/40 font-mono text-xs hover:bg-bg-hover/50"
              >
                <td className="px-3 py-2 text-muted">{i + 1}</td>
                <td className="px-3 py-2 font-sans font-semibold">
                  {r.symbol.replace("USDT", "")}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatPrice(r.price)}
                </td>
                {/* Score bar */}
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <span className="tabular-nums">{r.score}</span>
                    <span className="relative h-1.5 w-14 overflow-hidden rounded-full bg-bg-hover">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${r.score}%`,
                          background:
                            r.score >= 62
                              ? "#0ecb81"
                              : r.score >= 55
                                ? "#7ecb6f"
                                : r.score > 45
                                  ? "#f0b90b"
                                  : "#f6465d",
                        }}
                      />
                    </span>
                  </div>
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    r.change_pct >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {r.change_pct >= 0 ? "+" : ""}
                  {r.change_pct.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">
                  {r.quote_volume_m.toLocaleString("vi-VN")}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    r.rsi == null
                      ? "text-muted"
                      : r.rsi > 70
                        ? "text-down"
                        : r.rsi < 30
                          ? "text-up"
                          : ""
                  }`}
                >
                  {r.rsi?.toFixed(1) ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted">
                  {r.atr_pct != null ? `${r.atr_pct.toFixed(2)}%` : "—"}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    r.rel_vol != null && r.rel_vol > 1.5 ? "font-semibold text-accent" : "text-muted"
                  }`}
                  title={r.rel_vol != null && r.rel_vol > 1.5 ? "Volume spike!" : ""}
                >
                  {r.rel_vol?.toFixed(2) ?? "—"}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    r.funding_pct != null && Math.abs(r.funding_pct) > 0.05
                      ? r.funding_pct > 0
                        ? "text-down"
                        : "text-up"
                      : "text-muted"
                  }`}
                >
                  {r.funding_pct != null ? r.funding_pct.toFixed(4) : "—"}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    r.oi_change_6h_pct == null
                      ? "text-muted"
                      : r.oi_change_6h_pct >= 0
                        ? "text-up"
                        : "text-down"
                  }`}
                >
                  {r.oi_change_6h_pct != null
                    ? `${r.oi_change_6h_pct >= 0 ? "+" : ""}${r.oi_change_6h_pct.toFixed(1)}%`
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold ${BIAS_CLS[r.bias] ?? ""}`}
                  >
                    {r.bias}
                  </span>
                </td>
                <td className="px-3 py-2 text-[10px] text-muted">
                  {r.mtf?.replace("_", " ") ?? "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/?symbol=${r.symbol}`}
                    className="rounded border border-bg-border px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
                  >
                    →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
        Score = MTF + chỉ báo + whales + CVD + order book + volatility ·
        R-Vol > 1.5 = volume spike (highlight) · Funding âm = shorts pay longs
        (squeeze fuel) · OI↑ + giá↑ = trend healthy
      </p>
    </main>
  );
}