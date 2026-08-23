"use client";

// 🎯 Confluence Score gauge — one 0-100 number from all signal sources.
// Radial SVG arc + weighted breakdown on hover.
import { useEffect, useState } from "react";

interface Part {
  name: string;
  pts: number;
  max: number;
}

interface Data {
  score: number;
  bias: string;
  mtf_alignment: string | null;
  cvd: string | null;
  parts: Part[];
}

const BIAS_CLS: Record<string, string> = {
  "LONG FAVOURABLE": "text-up",
  "LEAN LONG": "text-up",
  NEUTRAL: "text-accent",
  "LEAN SHORT": "text-down",
  "SHORT FAVOURABLE": "text-down",
};

const PART_VN: Record<string, string> = {
  "MTF Trend": "Trend đa TF",
  Indicators: "Chỉ báo",
  Whales: "Cá mập",
  "CVD Flow": "Dòng tiền",
  "Book Balance": "Sổ lệnh",
  Volatility: "Biên độ",
};

function arcColor(score: number) {
  if (score >= 62) return "#0ecb81";
  if (score >= 55) return "#7ecb6f";
  if (score >= 45) return "#f0b90b";
  if (score > 38) return "#e8813a";
  return "#f6465d";
}

export default function ConfluenceGauge({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(`/api/analysis/confluence?symbol=${symbol}`).then(
          (x) => x.json()
        );
        if (!cancelled) setData(r);
      } catch {
        /* keep old */
      }
    }
    load();
    const id = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  if (!data) return null;

  const score = data.score;
  // Semicircle from -180° to 0°.
  const angle = (score / 100) * Math.PI; // radians from left
  const cx = 50;
  const cy = 46;
  const r = 38;
  const nx = cx - r * Math.cos(angle);
  const ny = cy - r * Math.sin(angle);

  return (
    <div
      className="flex shrink-0 items-center gap-3 border-t border-bg-border bg-bg-panel px-3 py-2"
      title="Điểm tổng hợp từ trend đa TF, chỉ báo, cá mập, dòng tiền, sổ lệnh & biên độ"
    >
      {/* Gauge */}
      <svg viewBox="0 0 100 52" className="h-12 w-24 shrink-0">
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#232a35"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${nx} ${ny}`}
          fill="none"
          stroke={arcColor(score)}
          strokeWidth="7"
          strokeLinecap="round"
          className="transition-all duration-700"
        />
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          fill={arcColor(score)}
          fontSize="17"
          fontWeight="bold"
          fontFamily="monospace"
        >
          {score}
        </text>
      </svg>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">🎯 Confluence</span>
          <span className={`text-sm font-bold ${BIAS_CLS[data.bias] ?? ""}`}>
            {data.bias}
          </span>
        </div>
        {/* Weighted breakdown bars */}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          {data.parts.map((p) => {
            const pct = p.pts / p.max;
            return (
              <span
                key={p.name}
                onMouseEnter={() => setHover(p.name)}
                onMouseLeave={() => setHover(null)}
                title={`${PART_VN[p.name] ?? p.name}: ${p.pts}/${p.max}`}
                className="flex cursor-help items-center gap-1 text-[9px] font-mono"
              >
                <span
                  className={`inline-block h-1.5 w-10 overflow-hidden rounded-full bg-bg-hover ${
                    hover === p.name ? "ring-1 ring-accent" : ""
                  }`}
                >
                  <span
                    className="block h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(3, pct * 100)}%`,
                      background:
                        pct > 0.6 ? "#0ecb81" : pct < 0.4 ? "#f6465d" : "#f0b90b",
                    }}
                  />
                </span>
                <span className="text-muted">{PART_VN[p.name] ?? p.name}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}