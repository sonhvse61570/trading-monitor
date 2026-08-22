"use client";

// Toast notifications — new signals pop in bottom-right.
import { useEffect, useState } from "react";
import type { Signal } from "@/lib/types";

interface Toast {
  id: number;
  signal: Signal;
}

let nextId = 1;
const listeners = new Set<(t: Toast) => void>();

/** Call from anywhere (e.g. WS handlers) to show a signal toast. */
export function pushSignalToast(sig: Signal) {
  const toast = { id: nextId++, signal: sig };
  listeners.forEach((fn) => fn(toast));
}

export default function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function onToast(t: Toast) {
      setToasts((prev) => [...prev.slice(-3), t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 6000);
    }
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => {
        const isLong = t.signal.side === "LONG";
        return (
          <div
            key={t.id}
            className={`toast-in pointer-events-auto w-72 rounded-lg border p-3 shadow-lg backdrop-blur ${
              isLong
                ? "border-up/50 bg-up/10"
                : "border-down/50 bg-down/10"
            } bg-bg-panel/90`}
          >
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span
                className={`rounded px-1.5 py-0.5 ${
                  isLong ? "bg-up text-black" : "bg-down text-white"
                }`}
              >
                {t.signal.side}
              </span>
              <span className="font-mono">
                {t.signal.symbol.replace("USDT", "")}
              </span>
              <span className="ml-auto rounded bg-accent/20 px-1.5 py-0.5 text-accent">
                {t.signal.strategy}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted">{t.signal.reason}</p>
            <p className="mt-1 font-mono text-xs tabular-nums">
              @ {t.signal.price.toLocaleString("vi-VN")}
            </p>
          </div>
        );
      })}
    </div>
  );
}