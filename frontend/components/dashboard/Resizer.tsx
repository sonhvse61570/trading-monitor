"use client";

// Drag handle to resize a panel; persists width to localStorage.
import { useCallback, useEffect, useRef } from "react";

export default function Resizer({
  storageKey,
  side,
  min = 180,
  max = 480,
  onWidth,
}: {
  storageKey: string;
  /** Which edge the handle sits on: "right" (left panel) or "left" (right panel). */
  side: "left" | "right";
  min?: number;
  max?: number;
  onWidth: (w: number) => void;
}) {
  const dragging = useRef(false);

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      // For left panel: width grows as mouse moves right.
      // For right panel: width grows as mouse moves left.
      const w =
        side === "left"
          ? e.clientX
          : window.innerWidth - e.clientX;
      const clamped = Math.max(min, Math.min(max, w));
      onWidth(clamped);
    }
    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [side, min, max, onWidth]);

  return (
    <div
      onMouseDown={onMouseDown}
      title="Kéo để đổi độ rộng"
      className="relative z-10 w-1.5 shrink-0 cursor-col-resize bg-bg-border transition-colors hover:bg-accent/60"
    >
      {/* Wider invisible hit area for easier grabbing */}
      <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
    </div>
  );
}

/** Load persisted widths once on mount. */
export function loadWidth(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v >= 160 && v <= 560 ? v : fallback;
  } catch {
    return fallback;
  }
}