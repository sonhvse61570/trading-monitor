"use client";

// Shared WS connection state — one socket, many subscribers.
// Components can also subscribe to ticker/signal messages via onMessage.
import { useEffect, useRef, useState } from "react";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://127.0.0.1:8000";

type MessageHandler = (msg: { type: string; data: unknown }) => void;
const handlers = new Set<MessageHandler>();

let ws: WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryIn = 5;
let connected = false;
const stateListeners = new Set<(s: { connected: boolean; retryIn: number }) => void>();

function notifyState() {
  stateListeners.forEach((fn) => fn({ connected, retryIn }));
}

function connect() {
  if (typeof window === "undefined") return;
  ws = new WebSocket(`${WS_URL}/ws`);

  ws.onopen = () => {
    connected = true;
    retryIn = 5;
    notifyState();
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      handlers.forEach((fn) => fn(msg));
    } catch {
      /* ignore */
    }
  };

  ws.onclose = () => {
    connected = false;
    notifyState();
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (retryIn > 1) retryIn -= 1;
      notifyState();
      connect();
    }, 5000);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

// Connect once per page load.
if (typeof window !== "undefined" && !ws) {
  connect();
}

export function subscribeWs(handler: MessageHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function useWsConnectionState() {
  const [state, setState] = useState({ connected, retryIn });

  useEffect(() => {
    stateListeners.add(setState);
    notifyState(); // sync immediately
    return () => {
      stateListeners.delete(setState);
    };
  }, []);

  return state;
}