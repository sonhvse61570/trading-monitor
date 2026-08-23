"use client";

// 🔍 Screener page — market-wide confluence ranking.
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/components/Watchlist";

interface Row {
  symbol: string;
  price: number;
  change_pct: number;
  score: number;
  bias: string;
  mtf: string | null;
  cvd: string | null;
}

const BIAS_CLS: Record<string, string> = {
  "LONG FAVOURABLE": "bg-up text-black",
  "LEAN LONG": "bg-up/20 text-up",
  NEUTRAL: "bg-accent/15 text-accent",
  "LEAN SHORT": "bg-down/20 text-down",
  "SHORT FAVOURABLE": "bg-down text-white",
};

export default function ScreenerPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "long" | "short">("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/screener?top=30").then((x) => x.json());
        if (!cancelled) setRows(r.rows ?? []);
      } catch {
        /* keep old */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 120000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const filtered = rows.filter((r) =>
    filter === "all"
      ? true
      : filter === "long"
        ? r.score >= 55
        : r.score <= 45
  );

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
          Confluence Score · top liquid USDT perps · refresh 2m
        </span>
        <div className="ml-auto flex gap-1">
          {(
            [
              ["all", "Tất cả"],
              ["long", "Long bias ≥55"],
              ["short", "Short bias ≤45"],
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
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-bg-border text-left text-xs uppercase text-muted">
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Symbol</th>
              <th className="px-4 py-2 text-right">Giá</th>
              <th className="px-4 py-2 text-right">24h</th>
              <th className="px-4 py-2 text-center">Score</th>
              <th className="px-4 py-2">Bias</th>
              <th className="px-4 py-2">MTF</th>
              <th className="px-4 py-2">CVD</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted">
                  Đang quét thị trường (chấm điểm từng symbol)...
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted">
                  Không có setup nào khớp bộ lọc.
                </td>
              </tr>
            )}
            {filtered.map((r, i) => (
              <tr
                key={r.symbol}
                className="border-b border-bg-border/40 hover:bg-bg-hover/50"
              >
                <td className="px-4 py-2 font-mono text-xs text-muted">{i + 1}</td>
                <td className="px-4 py-2 font-semibold">{r.symbol.replace("USDT", "")}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {formatPrice(r.price)}
                </td>
                <td
                  className={`px-4 py-2 text-right font-mono tabular-nums ${
                    r.change_pct >= 0 ? "text-up" : "text-down"
                  }`}
                >
                  {r.change_pct >= 0 ? "+" : ""}
                  {r.change_pct.toFixed(2)}%
                </td>
                {/* Score bar */}
                <td className="px-4 py-2">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-8 text-right font-mono tabular-nums">
                      {r.score}
                    </span>
                    <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-bg-hover">
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
                <td className="px-4 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold ${BIAS_CLS[r.bias] ?? ""}`}
                  >
                    {r.bias}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-muted">
                  {r.mtf?.replace("_", " ") ?? "—"}
                </td>
                <td className="px-4 py-2 text-xs capitalize text-muted">
                  {r.cvd ?? "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/?symbol=${r.symbol}`}
                    className="rounded border border-bg-border px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
                  >
                    Phân tích →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-center text-[11px] text-muted">
        Score tổng hợp từ MTF trend + chỉ báo + whale flow + CVD + order book +
        volatility. Click "Phân tích" để mở dashboard với symbol đó.
      </p>
    </main>
  );
}