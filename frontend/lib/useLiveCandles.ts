"use client";

// Subscribes to the backend candle WS and merges updates into the
// initial REST-loaded candle array (updates last candle in place,
// appends when a new candle opens).
import { useEffect, useRef, useState } from "react";
import type { Candle } from "./types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://127.0.0.1:8000";

export function useLiveCandles(
  initial: Candle[],
  symbol: string,
  interval: string
) {
  const [candles, setCandles] = useState<Candle[]>(initial);
  const candlesRef = useRef<Candle[]>(initial);

  // Reset when the REST snapshot changes (symbol/interval switch)
  useEffect(() => {
    candlesRef.current = initial;
    setCandles(initial);
  }, [initial]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(`${WS_URL}/ws/candles/${symbol}?interval=${interval}`);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type !== "candle") return;
          const c: Candle & { closed?: boolean } = msg.data;
          const arr = candlesRef.current;
          if (arr.length === 0) return;
          const last = arr[arr.length - 1];
          if (c.time === last.time) {
            arr[arr.length - 1] = { ...c };
          } else if (c.time > last.time) {
            arr.push({ ...c });
            if (arr.length > 500) arr.shift();
          }
          setCandles([...arr]);
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
  }, [symbol, interval]);

  return candles;
}