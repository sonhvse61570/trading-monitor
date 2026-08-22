"use client";

// Live signals feed — built-in strategies + external bot webhooks.
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Signal } from "@/lib/types";

export default function SignalsFeed() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Initial load
  useEffect(() => {
    api.signals(100).then(setSignals).catch(() => setSignals([]));
  }, []);

  // Subscribe to live signals over the shared WS hub
  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    function connect() {
      const ws = new WebSocket("ws://127.0.0.1:8000/ws");
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "signal") {
            setSignals((prev) => [msg.data as Signal, ...prev].slice(0, 200));
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(connect, 3000);
      };
    }
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, []);

  async function runNow() {
    try {
      await api.runStrategies();
    } catch {
      /* surfaced via feed */
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-bg-border px-3 py-2">
        <span className="text-sm font-semibold">⚡ Signals Feed</span>
        <button
          onClick={runNow}
          className="rounded bg-accent/20 px-2 py-1 text-xs text-accent hover:bg-accent/30"
        >
          Quét ngay
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {signals.length === 0 && (
          <p className="p-4 text-center text-sm text-muted">
            Chưa có signal nào. Nhấn “Quét ngay” hoặc bot ngoài POST tới
            /api/signals/webhook.
          </p>
        )}
        {signals.map((s, i) => (
          <div
            key={`${s.ts}-${i}`}
            className={`mb-1 rounded border-l-2 bg-bg-hover/60 px-2 py-1.5 text-xs ${
              s.side === "LONG" ? "border-up" : s.side === "SHORT" ? "border-down" : "border-muted"
            }`}
          >
            <div className="flex items-center justify-between font-mono">
              <span>
                <b className={s.side === "LONG" ? "text-up" : "text-down"}>{s.side}</b>{" "}
                {s.symbol.replace("USDT", "")}
              </span>
              <span className="text-muted">{new Date(s.ts).toLocaleTimeString("vi-VN")}</span>
            </div>
            <div className="mt-0.5 text-muted">
              [{s.strategy}] {s.reason} @ {s.price}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}