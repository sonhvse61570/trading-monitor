"use client";

// Subscribes to the backend WS hub and merges live ticker updates
// on top of the initial REST snapshot.
import { useEffect, useRef, useState } from "react";
import type { Ticker } from "./types";

// Next.js rewrites do NOT proxy WebSockets, so connect straight to the
// backend. Override with NEXT_PUBLIC_WS_URL in production.
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://127.0.0.1:8000";

export function useLiveTickers(initial: Ticker[]) {
  const [tickers, setTickers] = useState<Ticker[]>(initial);
  const mapRef = useRef(new Map(initial.map((t) => [t.symbol, t])));

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(`${WS_URL}/ws`);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "ticker") {
            const t: Ticker = msg.data;
            // Compute change_pct from open_24h when present.
            const prev = mapRef.current.get(t.symbol);
            const open = (t as Ticker & { open_24h?: number }).open_24h;
            const merged: Ticker = {
              ...(prev ?? t),
              ...t,
              change_pct:
                open && open > 0 ? ((t.last_price - open) / open) * 100 : (prev?.change_pct ?? 0),
            };
            mapRef.current.set(t.symbol, merged);
            setTickers(Array.from(mapRef.current.values()));
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (!closed) retryTimer = setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  return tickers;
}