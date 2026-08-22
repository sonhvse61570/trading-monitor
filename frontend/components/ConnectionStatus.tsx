"use client";

// WS connection indicator with reconnect countdown.
import { useEffect, useState } from "react";
import { useWsConnectionState } from "@/lib/useWsConnection";

export default function ConnectionStatus() {
  const state = useWsConnectionState();

  return (
    <span
      className="flex items-center gap-1.5 rounded bg-bg-hover px-2 py-1 text-[10px]"
      title={
        state.connected
          ? "WebSocket đã kết nối — dữ liệu real-time"
          : `Mất kết nối — thử lại sau ${state.retryIn}s`
      }
    >
      <span
        className={`pulse-dot inline-block h-1.5 w-1.5 rounded-full ${
          state.connected ? "bg-up" : "bg-down"
        }`}
      />
      <span className={state.connected ? "text-up" : "text-down"}>
        {state.connected ? "LIVE" : `RECONNECT ${state.retryIn}s`}
      </span>
    </span>
  );
}