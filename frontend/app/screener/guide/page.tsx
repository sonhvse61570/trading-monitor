"use client";

// 📖 Hướng dẫn sử dụng Screener — workflow & diễn giải chỉ báo.
import Link from "next/link";

function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-bg-border bg-bg-panel p-5">
      <h2 className="mb-3 text-base font-bold">
        {icon} {title}
      </h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}

function Term({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="flex gap-3 border-b border-bg-border/40 pb-2 last:border-0 last:pb-0">
      <span className="w-28 shrink-0 font-mono text-xs font-semibold text-accent">
        {term}
      </span>
      <span className="flex-1">{desc}</span>
    </div>
  );
}

export default function ScreenerGuidePage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-bg px-4 py-6 sm:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/screener"
          className="rounded border border-bg-border px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
        >
          ← Screener
        </Link>
        <h1 className="text-xl font-bold">📖 Hướng dẫn sử dụng Screener</h1>
        <span className="rounded bg-bg-panel px-2 py-1 text-[10px] text-muted">
          Cập nhật theo tính năng hiện tại
        </span>
      </div>

      {/* Quick workflow */}
      <Section icon="⚡" title="Workflow nhanh — từ quét đến lệnh trong 1 phút">
        <ol className="list-inside list-decimal space-y-1.5">
          <li>
            Mở tab <b className="text-white">🥷 Gom hàng âm thầm</b> → tìm coin
            score cao nhất đang bị tích lũy (ưu tiên phase D/C + trend ↗).
          </li>
          <li>
            Hoặc tab <b className="text-white">📊 Xếp hạng</b> → sort theo Score,
            tìm bias LONG FAVOURABLE.
          </li>
          <li>
            Click nút <b className="text-white">→</b> ở dòng coin đó → mở
            Dashboard với đúng symbol.
          </li>
          <li>
            Trên Dashboard: xem chart với zones overlay + whale markers → đọc
            Trade Setup Card (entry/SL/TP tự sinh) → tính size bằng Position
            Calculator → đặt lệnh.
          </li>
          <li>
            Hover vào symbol trong bảng gom hàng để đọc{" "}
            <b className="text-white">đánh giá narrative</b> giải thích từng tín
            hiệu bằng số liệu thật.
          </li>
        </ol>
      </Section>

      {/* Ranking tab */}
      <div className="mt-4">
        <Section icon="📊" title="Tab Xếp hạng — hiểu từng cột">
          <Term
            term="Score"
            desc="Confluence 0–100 tổng hợp MTF trend + RSI/MACD + whale flow + CVD + order book imbalance + volatility. ≥62 = mạnh, 55–62 = tốt, ≤45 = short bias."
          />
          <Term
            term="24h %"
            desc="Biến động giá 24h. Kết hợp OI: giá tăng + OI tăng = trend healthy; giá tăng + OI giảm = short squeeze cạn nhiên liệu."
          />
          <Term term="Vol $M" desc="Volume 24h (triệu USD) — thanh khoản. Chỉ trade symbol có Vol đủ lớn để thoát vị thế dễ dàng." />
          <Term term="RSI" desc="RSI 14 khung 15m. >70 overbought (chú ý long), <30 oversold (cơ hội mua). Màu đỏ/xanh tự động cảnh báo." />
          <Term term="ATR%" desc="Biên độ trung bình 14 nến (% giá). Dùng để đặt SL hợp lý: SL tối thiểu ≈ 1×ATR%. ATR cao = cần size nhỏ hơn." />
          <Term term="R-Vol" desc="Relative volume: volume nến hiện tại / TB 20 nến. >1.5 highlight accent = volume spike — thường đi kèm breakout hoặc tin." />
          <Term term="Funding%" desc="Rate funding hiện tại. >0.05% đỏ = longs pay nhiều (rủi ro long squeeze); âm xanh = shorts pay (squeeze fuel cho pump)." />
          <Term term="OI 6h%" desc="Open Interest thay đổi 6 giờ. OI tăng = tiền mới vào; OI giảm mạnh = de-leveraging." />
        </Section>
      </div>

      {/* Accumulation tab */}
      <div className="mt-4">
        <Section icon="🥷" title="Tab Gom hàng âm thầm — 5 dấu hiệu Wyckoff">
          <p>
            Detector chấm điểm 100 cho từng coin từ các tín hiệu kinh điển của
            Wyckoff accumulation:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <b className="text-white">🧽 Hấp thụ (30đ)</b> — CVD tăng mạnh trong
              khi giá đi ngang: ai đó nuốt mọi lệnh bán mà không đẩy giá.
            </li>
            <li>
              <b className="text-white">🏗️ OI tăng (20đ)</b> — vị thế mới liên tục
              được mở (+4%/6h = full điểm).
            </li>
            <li>
              <b className="text-white">📦 Vol im lặng (20đ)</b> — volume gấp
              1.2x nhưng range 3h hẹp dưới 3%: hoạt động bí mật trong vùng giá
              chặt.
            </li>
            <li>
              <b className="text-white">🐋 Whale mua (20đ)</b> — lệnh ≥$20k nghiêng
              về buy taker.
            </li>
            <li>
              <b className="text-white">❄️ Funding lạnh (10đ)</b> — đám đông chưa
              phát hiện (≤0.02%): vẫn còn stealth.
            </li>
          </ul>
          <p className="pt-2">
            Chỉ hiện coin đạt ≥35 điểm. Nút{" "}
            <b className="text-white">⟳ Quét lại</b> bỏ qua cache để re-scan ngay.
          </p>
        </Section>
      </div>

      {/* Phases */}
      <div className="mt-4">
        <Section icon="🎯" title="Phase Wyckoff — đọc vị trí trong chu kỳ">
          <div className="space-y-2">
            <div className="rounded border border-up/30 bg-up/5 p-3">
              <b className="text-up">D · Markup gần</b>{" "}
              <span className="text-[11px]">(≥4 signals + score ≥70)</span>
              <br />
              Tích lũy hoàn tất, cá mập đã nạp xong. Vùng giá sắp breakout lên —
              cơ hội entry cuối cùng trước markup. Ưu tiên số 1.
            </div>
            <div className="rounded border border-accent/30 bg-accent/5 p-3">
              <b className="text-accent">C · Spring test</b>{" "}
              <span className="text-[11px]">(≥3 signals)</span>
              <br />
              Đang test đáy lần cuối (spring/shakeout). Theo dõi sát — nếu spring
              thành công sẽ chuyển sang D. Có thể entry sớm với size nhỏ.
            </div>
            <div className="rounded border border-bg-border bg-bg-hover/30 p-3">
              <b>B · Đang build</b>
              <br />
              Giai đoạn tích lũy sớm. Chưa vội — thêm vào watchlist, chờ score
              và phase tiến triển.
            </div>
          </div>
        </Section>
      </div>

      {/* Duration + trend */}
      <div className="mt-4">
        <Section icon="🕐" title="Thời gian gom & Trend — trí nhớ của hệ thống">
          <Term
            term="Thời gian gom"
            desc="Khoảng thời gian kể từ lần đầu hệ thống phát hiện dấu hiệu (lưu trong SQLite 24h). Gom càng lâu (>4h) = kế hoạch càng bài bản, breakout càng chắc."
          />
          <Term
            term="Trend ↗ rising"
            desc="Score cao hơn median các lần scan trước >5 điểm — cá mập đang tăng tốc gom. Tín hiệu tốt nhất khi đi kèm phase C/D."
          />
          <Term
            term="Trend ↘ falling"
            desc="Score giảm — dấu hiệu có thể đã kết thúc hoặc là noise. Cẩn trọng trước khi entry."
          />
          <Term
            term="Trend ✦ new"
            desc="Mới phát hiện lần đầu. Quan sát thêm vài chu kỳ scan (3 phút/lần) để xác nhận trend."
          />
        </Section>
      </div>

      {/* Combining */}
      <div className="mt-4">
        <Section icon="🧩" title="Combo tín hiệu mạnh nhất">
          <div className="rounded border border-up/30 bg-up/5 p-3 font-medium">
            Phase D/C + Trend ↗ + Thời gian gom dài + Bullish divergence trên
            chart + Whale markers xanh cụm tại support zone
          </div>
          <p className="pt-1">
            = xác suất cao nhất cho một markup move. Khi thấy combo này, mở
            Dashboard, dùng Trade Setup Generator sinh plan, đặt limit order tại
            zone support và chờ.
          </p>
        </Section>
      </div>

      {/* Caveats */}
      <div className="mt-4 mb-6">
        <Section icon="⚠️" title="Lưu ý quan trọng">
          <ul className="ml-4 list-disc space-y-1">
            <li>
              Liquidation clusters là <b>ước lượng heuristic</b> (giả định đòn
              bẩy 10x), không phải dữ liệu sàn thực.
            </li>
            <li>
              Score/tín hiệu đều từ public data — không thay thế quản trị rủi
              ro. Luôn đặt SL và size theo Position Calculator (tối đa 1-2% vốn
              mỗi lệnh).
            </li>
            <li>
              Cache 3 phút nghĩa là dữ liệu trễ tối đa ~3 phút — với scalp siêu
              nhanh hãy bấm ⟳ Quét lại.
            </li>
            <li>
              Không FOMO khi trend ↘ hoặc funding đã nóng — stealth phase đã
              hết, bạn là người cuối cùng biết tin.
            </li>
          </ul>
        </Section>
      </div>

      <div className="text-center">
        <Link
          href="/screener"
          className="inline-block rounded-lg bg-accent/20 px-5 py-2 text-sm font-semibold text-accent hover:bg-accent/30"
        >
          ← Áp dụng ngay trong Screener
        </Link>
      </div>
    </main>
  );
}