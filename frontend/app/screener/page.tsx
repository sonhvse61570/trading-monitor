"use client";

// 🔍 Screener — rich ranking + 🥷 stealth accumulation detector.
import { useCallback, useEffect, useMemo, useState } from "react";
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

interface AccRow {
  symbol: string;
  price: number;
  change_pct: number;
  score: number;
  assessment?: string;
  phase?: string;
  hours_accumulating?: number;
  score_trend?: "rising" | "falling" | "steady" | "new";
  oi_change_6h_pct: number | null;
  rel_volume: number | null;
  range_3h_pct: number | null;
  whale_net_usd: number | null;
  funding_pct: number | null;
  signals: Record<string, boolean>;
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

const TREND_META: Record<string, { icon: string; cls: string; label: string }> = {
  rising: { icon: "↗", cls: "text-up", label: "Score đang tăng" },
  falling: { icon: "↘", cls: "text-down", label: "Score đang giảm" },
  steady: { icon: "→", cls: "text-muted", label: "Score ổn định" },
  new: { icon: "✦", cls: "text-accent", label: "Mới phát hiện" },
};

function fmtHours(h: number): string {
  if (h <= 0) return "vừa phát hiện";
  if (h < 1) return `${Math.round(h * 60)} phút`;
  if (h < 24) return `${h.toFixed(1)} giờ`;
  return `${(h / 24).toFixed(1)} ngày`;
}

const SIGNAL_LABELS: [string, string][] = [
  ["absorption", "🧽 Hấp thụ"],
  ["oi_building", "🏗️ OI tăng"],
  ["quiet_volume", "📦 Vol im lặng"],
  ["whale_buying", "🐋 Whale mua"],
  ["funding_cool", "❄️ Funding lạnh"],
];

export default function ScreenerPage() {
  const [tab, setTab] = useState<"rank" | "accum">("rank");
  const [rows, setRows] = useState<Row[]>([]);
  const [accRows, setAccRows] = useState<AccRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [accLoading, setAccLoading] = useState(false);
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

  // Accumulation loads lazily when its tab opens.
  const loadAcc = useCallback((force: boolean) => {
    let cancelled = false;
    setAccLoading(true);
    fetch(`/api/screener/accumulation?top=20&refresh=${force ? 1 : 0}`)
      .then((x) => x.json())
      .then((r) => !cancelled && setAccRows(r.rows ?? []))
      .catch(() => undefined)
      .finally(() => !cancelled && setAccLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tab !== "accum" || accRows.length > 0) return;
    return loadAcc(false);
  }, [tab, accRows.length, loadAcc]);

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
        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-bg-border bg-bg-panel p-0.5">
          {(
            [
              ["rank", "📊 Xếp hạng"],
              ["accum", "🥷 Gom hàng âm thầm"],
            ] as ["rank" | "accum", string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded px-3 py-1 text-xs ${
                tab === id
                  ? "bg-accent/20 font-semibold text-accent"
                  : "text-muted hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "accum" && (
          <button
            onClick={() => loadAcc(true)}
            disabled={accLoading}
            title="Quét lại ngay (bỏ qua cache 3 phút)"
            className="rounded border border-accent/40 px-2 py-1 text-[11px] text-accent hover:bg-accent/10 disabled:opacity-50"
          >
            ⟳ Quét lại
          </button>
        )}
        <div className="ml-auto flex gap-1">
          {tab === "rank" &&
            (
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

      {/* ===== Rank table ===== */}
      {tab === "rank" && (
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
                    Đang quét thị trường...
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
                      r.rel_vol != null && r.rel_vol > 1.5
                        ? "font-semibold text-accent"
                        : "text-muted"
                    }`}
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
      )}

      {/* ===== Stealth accumulation ===== */}
      {tab === "accum" && (
        <div className="overflow-x-auto rounded-lg border border-bg-border bg-bg-panel">
          <p className="border-b border-bg-border px-4 py-2 text-[11px] leading-snug text-muted">
            🥷 Phát hiện dấu hiệu Wyckoff gom hàng bí mật: CVD tăng khi giá đi
            ngang (hấp thụ) · OI xây dựng · volume cao trong range hẹp · whale
            net buy · funding chưa nóng. Score ≥60 = vùng tích lũy mạnh.
          </p>
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-bg-border text-left text-[10px] uppercase text-muted">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Symbol</th>
                <th className="px-3 py-2 text-right">Giá</th>
                <th className="px-3 py-2 text-center">Score</th>
                <th className="px-3 py-2">Phase Wyckoff</th>
                <th className="px-3 py-2">Dấu hiệu</th>
                <th className="px-3 py-2 text-right">Thời gian gom</th>
                <th className="px-3 py-2 text-right">Trend</th>
                <th className="px-3 py-2 text-right">OI 6h</th>
                <th className="px-3 py-2 text-right">Whale Net</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {accLoading && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted">
                    Đang quét dấu hiệu tích lũy...
                  </td>
                </tr>
              )}
              {!accLoading && accRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-muted">
                    Hiện không có coin nào đủ dấu hiệu gom hàng âm thầm.
                  </td>
                </tr>
              )}
              {accRows.map((r, i) => {
                const tm = TREND_META[r.score_trend ?? "new"];
                return (
                <tr
                  key={r.symbol}
                  title={r.assessment}
                  className="border-b border-bg-border/40 font-mono text-xs hover:bg-bg-hover/50"
                >
                  <td className="px-3 py-2 text-muted">{i + 1}</td>
                  <td className="px-3 py-2 font-sans font-semibold underline decoration-dotted decoration-accent/50 underline-offset-4">
                    {r.symbol.replace("USDT", "")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPrice(r.price)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-block w-12 rounded px-1.5 py-0.5 font-bold ${
                        r.score >= 60
                          ? "bg-up text-black"
                          : r.score >= 45
                            ? "bg-accent/20 text-accent"
                            : "bg-bg-hover text-muted"
                      }`}
                    >
                      {r.score}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        r.phase?.startsWith("D")
                          ? "bg-up text-black"
                          : r.phase?.startsWith("C")
                            ? "bg-accent/25 text-accent"
                            : "bg-bg-hover text-muted"
                      }`}
                    >
                      {r.phase ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {SIGNAL_LABELS.map(([key, label]) =>
                        r.signals[key] ? (
                          <span
                            key={key}
                            className="rounded bg-up/15 px-1 py-0.5 text-[9px] text-up"
                          >
                            {label.split(" ")[0]}
                          </span>
                        ) : null
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-[11px] text-muted" title="Kể từ lần đầu phát hiện dấu hiệu trong 24h qua">
                    🕐 {fmtHours(r.hours_accumulating ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={`${tm.cls} font-semibold`}
                      title={tm.label}
                    >
                      {tm.icon} {r.score_trend ?? "new"}
                    </span>
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
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      r.whale_net_usd == null
                        ? "text-muted"
                        : r.whale_net_usd >= 0
                          ? "text-up"
                          : "text-down"
                    }`}
                  >
                    {r.whale_net_usd != null
                      ? `${r.whale_net_usd >= 0 ? "+" : ""}$${Math.round(Math.abs(r.whale_net_usd) / 1000)}k`
                      : "—"}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
        {
          "Score = MTF + chỉ báo + whales + CVD + order book + volatility · Phase D = Markup gần, C = Spring test, B = đang build · Thời gian gom tính từ lần đầu phát hiện (lưu 24h) · Trend = so với median score trước đó"
        }
      </p>
    </main>
  );
}
