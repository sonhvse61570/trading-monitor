"use client";

// Compact Fear & Greed badge for the dashboard header.
import { useEffect, useState } from "react";

interface Fng {
  value: number;
  label: string;
}

const emoji = (v: number) =>
  v <= 25 ? "😱" : v <= 45 ? "😟" : v < 55 ? "😐" : v < 75 ? "🙂" : "🤑";

const colorCls = (v: number) =>
  v <= 25 ? "text-down" : v >= 75 ? "text-up" : "text-accent";

export default function FearGreedBadge() {
  const [fng, setFng] = useState<Fng | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/intel/fear-greed").then((x) => x.json());
        if (!cancelled && typeof r.value === "number") setFng(r);
      } catch {
        /* ignore */
      }
    }
    load();
    const id = setInterval(load, 600000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!fng) return null;

  return (
    <span
      className="flex items-center gap-1 rounded bg-bg-hover px-2 py-1 text-[10px]"
      title={`Crypto Fear & Greed Index: ${fng.value} (${fng.label})`}
    >
      <span>{emoji(fng.value)}</span>
      <b className={`font-mono ${colorCls(fng.value)}`}>{fng.value}</b>
      <span className="hidden text-muted md:inline">{fng.label}</span>
    </span>
  );
}