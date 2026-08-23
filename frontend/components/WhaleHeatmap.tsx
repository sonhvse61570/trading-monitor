"use client";

// 🦈 Whale footprint heatmap — price (rows) × time (cols) grid.
// Green heat = whale buys, red = sells; intensity by notional.
import { useEffect, useMemo, useState } from "react";

interface Cell {
  row: number;
  col: number;
  price_lo: number;
  price_hi: number;
  buy: number;
  sell: number;
  total: number;
}

interface Data {
  rows: number;
  cols: number;
  price_min: number | null;
  price_max: number | null;
  t_start: number | null;
  cells: Cell[];
}

const THRESHOLDS = [10_000, 25_000, 50_000];

export default function WhaleHeatmap({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [threshold, setThreshold] = useState(25_000);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(
          `/api/analysis/whale-heatmap?symbol=${symbol}&min_notional=${threshold}`
        ).then((x) => x.json());
        if (!cancelled) setData(r);
      } catch {
        /* keep old */
      }
    }
    load();
    const id = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, threshold]);

  const { grid, maxTotal } = useMemo(() => {
    if (!data || data.cells.length === 0)
      return { grid: new Map<string, Cell>(), maxTotal: 1 };
    const g = new Map<string, Cell>();
    let mx = 0;
    for (const c of data.cells) {
      g.set(`${c.row}:${c.col}`, c);
      if (c.total > mx) mx = c.total;
    }
    return { grid: g, maxTotal: mx };
  }, [data]);

  // Price axis labels (top = high).
  const priceLabels = useMemo(() => {
    if (!data?.price_min || !data.price_max) return [];
    const rows = data.rows;
    return Array.from({ length: rows }, (_, i) => {
      const price =
        data.price_max! -
        ((data.price_max! - data.price_min!) * i) / (rows - 1);
      return { row: i, price };
    });
  }, [data]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header + threshold */}
      <div className="flex shrink-0 items-center gap-1 border-b border-bg-border px-2 py-1.5 text-xs">
        <span className="text-muted">🦈 Heatmap cá mập</span>
        <div className="ml-auto flex gap-0.5">
          {THRESHOLDS.map((t) => (
            <button
              key={t}
              onClick={() => setThreshold(t)}
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                threshold === t
                  ? "bg-accent/20 text-accent"
                  : "text-muted hover:bg-bg-hover"
              }`}
            >
              ${t / 1000}k
            </button>
          ))}
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="flex min-h-0 flex-1 overflow-y-auto p-2">
        {!data || data.cells.length === 0 ? (
          <p className="w-full self-center text-center text-xs text-muted">
            Không có lệnh ≥ ${threshold / 1000}k trong ~1000 trades gần nhất.
            <br />
            Thử giảm ngưỡng.
          </p>
        ) : (
          <div className="flex w-full gap-1">
            {/* Price axis */}
            <div className="flex shrink-0 flex-col justify-between font-mono text-[8px] leading-none text-muted">
              {priceLabels.map((p) => (
                <span key={p.row} className="h-[calc(100%/28)] truncate">
                  {p.price >= 1000
                    ? (p.price / 1000).toFixed(1) + "k"
                    : p.price.toPrecision(4)}
                </span>
              ))}
            </div>
            {/* Cells */}
            <div
              className="grid min-h-[280px] flex-1 gap-px"
              style={{
                gridTemplateRows: `repeat(${data.rows}, 1fr)`,
                gridTemplateColumns: `repeat(${data.cols}, 1fr)`,
                direction: "rtl", // newest time on the right → col order flipped below
              }}
            >
              {Array.from({ length: data.rows * data.cols }).map((_, idx) => {
                // rtl flips visual order; compute logical indices:
                const r = Math.floor(idx / data.cols);
                const cVis = idx % data.cols;
                const c = data.cols - 1 - cVis; // col 0 = oldest at right in rtl? no—rtl puts first child at right
                const cell = grid.get(`${r}:${c}`);
                if (!cell) {
                  return (
                    <div key={idx} className="rounded-sm bg-bg-hover/30" />
                  );
                }
                const intensity = Math.min(1, cell.total / maxTotal);
                const buyDominant = cell.buy >= cell.sell;
                const alpha = 0.15 + intensity * 0.85;
                return (
                  <div
                    key={idx}
                    title={`${cell.price_lo.toFixed(1)}–${cell.price_hi.toFixed(1)}\nBUY $${(cell.buy / 1000).toFixed(0)}k · SELL $${(cell.sell / 1000).toFixed(0)}k`}
                    className="rounded-sm transition-colors duration-500"
                    style={{
                      backgroundColor: buyDominant
                        ? `rgba(14, 203, 129, ${alpha})`
                        : `rgba(246, 70, 93, ${alpha})`,
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      {data && data.cells.length > 0 && (
        <div className="flex shrink-0 items-center justify-between border-t border-bg-border px-2 py-1 text-[9px] text-muted">
          <span>Trục dọc: giá · Trục ngang: thời gian (phải = mới nhất)</span>
          <span className="flex items-center gap-2">
            <span className="inline-block h-2 w-3 rounded" style={{ background: "rgba(246,70,93,0.8)" }} /> Bán
            <span className="inline-block h-2 w-3 rounded" style={{ background: "rgba(14,203,129,0.8)" }} /> Mua
            <span>· đậm hơn = to hơn</span>
          </span>
        </div>
      )}
    </div>
  );
}