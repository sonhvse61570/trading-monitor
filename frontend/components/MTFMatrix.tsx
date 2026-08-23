"use client";

// Multi-timeframe trend matrix — compact alignment badges.
import { useEffect, useState } from "react";

interface TfRow {
  tf: string;
  verdict: "bull" | "bear" | "flat";
}

interface Data {
  timeframes: TfRow[];
  alignment: string;
}

const ALIGNMENT_CLS: Record<string, string> = {
  STRONG_BULL: "bg-up/20 text-up",
  BULL_BIAS: "bg-up/10 text-up",
  STRONG_BEAR: "bg-down/20 text-down",
  BEAR_BIAS: "bg-down/10 text-down",
  MIXED: "bg-accent/15 text-accent",
};

const ALIGNMENT_VN: Record<string, string> = {
  STRONG_BULL: "TĂNG MẠNH",
  BULL_BIAS: "THIÊN TĂNG",
  STRONG_BEAR: "GIẢM MẠNH",
  BEAR_BIAS: "THIÊN GIẢM",
  MIXED: "TRÙNG PHÚNG",
};

export default function MTFMatrix({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(`/api/analysis/mtf?symbol=${symbol}`).then((x) =>
          x.json()
        );
        if (!cancelled) setData(r);
      } catch {
        /* keep old */
      }
    }
    load();
    const id = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  if (!data || data.timeframes.length === 0) return null;

  return (
    <div className="flex items-center gap-2 border-t border-bg-border bg-bg-panel px-3 py-1.5 text-xs">
      <span
        className={`rounded px-2 py-0.5 text-[11px] font-bold ${
          ALIGNMENT_CLS[data.alignment] ?? ""
        }`}
        title="Xu hướng tổng hợp từ EMA20/50 + độ dốc trên các khung thời gian"
      >
        MTF: {ALIGNMENT_VN[data.alignment] ?? data.alignment}
      </span>
      <div className="flex gap-1">
        {data.timeframes.map((r) => (
          <span
            key={r.tf}
            title={`${symbol} ${r.tf}: ${r.verdict}`}
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
              r.verdict === "bull"
                ? "bg-up/15 text-up"
                : r.verdict === "bear"
                  ? "bg-down/15 text-down"
                  : "bg-bg-hover text-muted"
            }`}
          >
            {r.tf} {r.verdict === "bull" ? "▲" : r.verdict === "bear" ? "▼" : "—"}
          </span>
        ))}
      </div>
    </div>
  );
}