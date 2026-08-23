"use client";

// 🔗 Correlation matrix heatmap — hourly returns, majors.
import { useEffect, useState } from "react";

interface Data {
  symbols: string[];
  matrix: (number | null)[][];
  hours: number;
}

function cellColor(r: number | null): string {
  if (r == null) return "#232a35";
  // -1 red → 0 dark → +1 green
  if (r >= 0) {
    const a = 0.15 + r * 0.75;
    return `rgba(14,203,129,${a})`;
  }
  const a = 0.15 + Math.abs(r) * 0.75;
  return `rgba(246,70,93,${a})`;
}

export default function CorrelationMatrix() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/analysis/correlation").then((x) =>
          x.json()
        );
        if (!cancelled) setData(r);
      } catch {
        /* keep old */
      }
    }
    load();
    const id = setInterval(load, 300000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!data || data.symbols.length === 0) return null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-3">
      <p className="mb-2 text-[10px] leading-snug text-muted">
        🔗 Tương quan returns {data.hours}h gần nhất — chọn cặp low-correlation
        để đa dạng hóa; high-correlation = rủi ro trùng lặp.
      </p>
      <table className="mx-auto border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th />
            {data.symbols.map((s) => (
              <th key={s} className="px-1 pb-1 font-mono text-[9px] text-muted">
                {s.replace("USDT", "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.matrix.map((row, i) => (
            <tr key={i}>
              <td className="pr-1 text-right font-mono text-[9px] text-muted">
                {data.symbols[i].replace("USDT", "")}
              </td>
              {row.map((v, j) => (
                <td key={j}>
                  <div
                    title={`${data.symbols[i]} × ${data.symbols[j]}: ${v ?? "—"}`}
                    className="flex h-8 w-12 items-center justify-center rounded font-mono text-[9px] tabular-nums"
                    style={{
                      background: cellColor(v),
                      color: v != null && Math.abs(v) > 0.5 ? "#0b0e11" : "#eaecef",
                    }}
                  >
                    {v != null ? v.toFixed(2) : "—"}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}