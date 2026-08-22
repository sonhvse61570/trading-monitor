"use client";

// Bottom panel: positions, open orders, order history (tabbed).
import { useState } from "react";
import { api } from "@/lib/api";
import type { Order, Position } from "@/lib/types";
import { formatPrice } from "./Watchlist";

interface Props {
  positions: Position[];
  openOrders: Order[];
  history: Order[];
  onCancelOrder: (orderId: number, symbol: string) => void;
  onClosePosition: (p: Position) => void;
  busyOrderId: number | null;
}

type Tab = "positions" | "open" | "history";

export default function PositionsOrders(props: Props) {
  const [tab, setTab] = useState<Tab>("positions");

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "positions", label: "Vị thế", count: props.positions.length },
    { id: "open", label: "Lệnh chờ", count: props.openOrders.length },
    { id: "history", label: "Lịch sử lệnh", count: props.history.length },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-1 border-b border-bg-border px-2 pt-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t px-3 py-1.5 text-sm ${
              tab === t.id
                ? "bg-bg-hover font-semibold text-white"
                : "text-muted hover:text-white"
            }`}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="ml-1.5 rounded-full bg-accent/20 px-1.5 text-xs text-accent">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "positions" && <PositionsTable {...props} />}
        {tab === "open" && <OpenOrdersTable {...props} />}
        {tab === "history" && <HistoryTable history={props.history} />}
      </div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="p-6 text-center text-sm text-muted">{msg}</p>;
}

function PositionsTable({ positions, onClosePosition, busyOrderId }: Props) {
  if (positions.length === 0)
    return <Empty msg="Không có vị thế nào đang mở." />;
  return (
    <table className="w-full text-left text-xs">
      <thead className="sticky top-0 bg-bg-panel text-muted">
        <tr>
          <Th>Symbol</Th><Th>Side</Th><Th>Size</Th><Th>Entry</Th>
          <Th>Mark</Th><Th>SL</Th><Th>R</Th><Th>Lev</Th><Th>PnL</Th><Th></Th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {positions.map((p) => {
          const isLong = p.size > 0;
          return (
            <tr key={p.symbol + p.side} className="border-b border-bg-border/50 hover:bg-bg-hover">
              <Td className="font-semibold">{p.symbol.replace("USDT", "")}</Td>
              <Td className={isLong ? "text-up" : "text-down"}>
                {isLong ? "LONG" : "SHORT"}
              </Td>
              <Td>{Math.abs(p.size)}</Td>
              <Td>{formatPrice(p.entry_price)}</Td>
              <Td>{formatPrice(p.mark_price)}</Td>
              <Td className="text-down">
                {p.stop_loss != null ? formatPrice(p.stop_loss) : "—"}
              </Td>
              <Td
                className={
                  p.r_multiple == null
                    ? "text-muted"
                    : p.r_multiple >= 1
                      ? "text-up"
                      : p.r_multiple >= 0
                        ? ""
                        : "text-down"
                }
              >
                {p.r_multiple != null ? `${p.r_multiple.toFixed(2)}R` : "—"}
              </Td>
              <Td>{p.leverage}x</Td>
              <Td className={p.pnl_unrealized >= 0 ? "text-up" : "text-down"}>
                {p.pnl_unrealized >= 0 ? "+" : ""}
                {p.pnl_unrealized.toFixed(2)}
              </Td>
              <Td>
                <button
                  onClick={() => onClosePosition(p)}
                  disabled={busyOrderId !== null}
                  className="rounded border border-down/60 px-2 py-0.5 text-down hover:bg-down/10 disabled:opacity-40"
                >
                  Đóng
                </button>
              </Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function OpenOrdersTable({ openOrders, onCancelOrder, busyOrderId }: Props) {
  if (openOrders.length === 0)
    return <Empty msg="Không có lệnh chờ." />;
  return (
    <table className="w-full text-left text-xs">
      <thead className="sticky top-0 bg-bg-panel text-muted">
        <tr>
          <Th>Thời gian</Th><Th>Symbol</Th><Th>Loại</Th><Th>Side</Th>
          <Th>Giá</Th><Th>Số lượng</Th><Th>Đã khớp</Th><Th></Th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {openOrders.map((o) => (
          <tr key={o.order_id} className="border-b border-bg-border/50 hover:bg-bg-hover">
            <Td>{new Date(o.time).toLocaleTimeString("vi-VN")}</Td>
            <Td className="font-semibold">{o.symbol.replace("USDT", "")}</Td>
            <Td>{o.type}</Td>
            <Td className={o.side === "BUY" ? "text-up" : "text-down"}>{o.side}</Td>
            <Td>{o.price != null ? formatPrice(o.price) : o.stop_price != null ? `trigger ${formatPrice(o.stop_price)}` : "—"}</Td>
            <Td>{o.orig_qty}</Td>
            <Td>{o.executed_qty}</Td>
            <Td>
              <button
                onClick={() => onCancelOrder(o.order_id, o.symbol)}
                disabled={busyOrderId === o.order_id}
                className="rounded border border-bg-border px-2 py-0.5 text-muted hover:border-down hover:text-down disabled:opacity-40"
              >
                Hủy
              </button>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HistoryTable({ history }: { history: Order[] }) {
  if (history.length === 0)
    return <Empty msg="Chưa có lịch sử lệnh (cần API key)." />;
  return (
    <table className="w-full text-left text-xs">
      <thead className="sticky top-0 bg-bg-panel text-muted">
        <tr>
          <Th>Thời gian</Th><Th>Symbol</Th><Th>Loại</Th><Th>Side</Th>
          <Th>Trạng thái</Th><Th>Giá TB</Th><Th>Số lượng</Th>
        </tr>
      </thead>
      <tbody className="font-mono">
        {history.map((o) => (
          <tr key={o.order_id} className="border-b border-bg-border/50 hover:bg-bg-hover">
            <Td>{new Date(o.time).toLocaleString("vi-VN")}</Td>
            <Td className="font-semibold">{o.symbol.replace("USDT", "")}</Td>
            <Td>{o.type}</Td>
            <Td className={o.side === "BUY" ? "text-up" : "text-down"}>{o.side}</Td>
            <Td>{statusLabel(o.status)}</Td>
            <Td>{o.avg_fill_price != null ? formatPrice(o.avg_fill_price) : "—"}</Td>
            <Td>{o.executed_qty}/{o.orig_qty}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    NEW: "Chờ khớp",
    FILLED: "Đã khớp",
    PARTIALLY_FILLED: "Khớp một phần",
    CANCELED: "Đã hủy",
    REJECTED: "Bị từ chối",
    EXPIRED: "Hết hạn",
  };
  return map[s] ?? s;
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-3 py-1.5 font-medium">{children}</th>;
}
function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-1.5 tabular-nums ${className}`}>{children}</td>;
}
