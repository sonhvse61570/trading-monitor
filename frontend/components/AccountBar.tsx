"use client";

import type { AccountInfo } from "@/lib/types";

export default function AccountBar({ account }: { account: AccountInfo | null }) {
  if (!account) {
    return (
      <div className="flex items-center gap-4 border-b border-bg-border bg-bg-panel px-4 py-2 text-xs text-muted">
        Chưa cấu hình API key — chỉ xem dữ liệu thị trường. (Xem backend/.env)
      </div>
    );
  }
  const pnl = account.total_pnl_unrealized;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-bg-border bg-bg-panel px-4 py-2 text-xs">
      <span className="font-semibold text-accent">Tài khoản Futures</span>
      <Stat label="Số dư" value={`$${account.total_wallet_balance.toFixed(2)}`} />
      <Stat
        label="Khả dụng"
        value={`$${account.available.toFixed(2)}`}
      />
      <Stat
        label="PnL chưa thực hiện"
        value={`${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`}
        className={pnl >= 0 ? "text-up" : "text-down"}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-muted">{label}</span>
      <b className={`font-mono tabular-nums ${className}`}>{value}</b>
    </span>
  );
}