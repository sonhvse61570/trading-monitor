"use client";

// 🕯️ Pattern & divergence detector panel.
import { useEffect, useState } from "react";

interface Signal {
  type: string;
  direction: "bull" | "bear" | "neutral";
  name: string;
  detail: string;
}

interface Data {
  rsi: number | null;
  signals: Signal[];
}

const DIR_CLS: Record<string, string> = {
  bull: "border-up/40 bg-up/10",
  bear: "border-down/40 bg-down/10",
  neutral: "border-bg-border bg-bg-hover/50",
};

const DIR_ICON: Record<string, string> = { bull: "▲", bear: "▼", neutral: "◆" };

export default function PatternDetector({
  symbol,
  interval,
}: {
  symbol: string;
  interval: string;
}) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(
          `/api/analysis/patterns?symbol=${symbol}&interval=${interval}`
        ).then((x) => x.json());
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
  }, [symbol, interval]);

  if (!data) return null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto text-xs">
      <div className="flex items-center justify-between border-b border-bg-border px-3 py-1.5">
        <span className="text-muted">🕯️ Patterns & Divergences</span>
        <span className="font-mono text-[10px] text-muted">
          RSI {data.rsi ?? "—"}
        </span>
      </div>

      {data.signals.length === 0 ? (
        <p className="px-3 py-4 text-center text-[11px] leading-snug text-muted">
          Không phát hiện pattern hoặc phân kỳ nào trên khung {interval}.
          Thị trường đang trong trạng thái bình thường.
        </p>
      ) : (
        <div className="space-y-1.5 p-2">
          {data.signals.map((s, i) => (
            <div
              key={i}
              className={`rounded border px-2 py-1.5 ${DIR_CLS[s.direction]}`}
            >
              <div className="flex items-center gap-1.5 font-semibold">
                <span
                  className={
                    s.direction === "bull"
                      ? "text-up"
                      : s.direction === "bear"
                        ? "text-down"
                        : "text-muted"
                  }
                >
                  {DIR_ICON[s.direction]}
                </span>
                <span>{s.name}</span>
                <span className="ml-auto rounded bg-bg-panel px-1 py-0.5 text-[8px] uppercase text-muted">
                  {s.type}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-muted">
                {s.detail}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}