# 🧠 BRAINSTORM — Trading Monitoring App

> App giám sát **và giao dịch** đa thị trường: thị trường real-time, chiến lược, lệnh lãi/lỗ, risk & báo cáo.

## ✅ Quyết định đã chốt

| Hạng mục | Quyết định |
|---|---|
| Thị trường | **Kết hợp nhiều thị trường** (crypto trước, mở rộng chứng khoán VN sau) |
| Mức tương tác | **Full trading** — đặt/hủy/sửa lệnh ngay trên app |
| Chiến lược | **Kiến trúc mở** — hỗ trợ bot bên ngoài kết nối vào VÀ strategy engine chạy trong app |
| Nền tảng | Web app (truy cập mọi nơi, đề xuất mặc định) |
| Người dùng | Bắt đầu cá nhân (single-user), thiết kế sẵn auth cho multi-user |

---

## 1. Tầm nhìn sản phẩm

Một dashboard duy nhất để trader:
- **Nhìn thấy** mọi thứ đang diễn ra trên thị trường (giá, volume, order book, funding...)
- **Theo dõi** các vị thế đang mở, lệnh chờ, lịch sử khớp lệnh
- **Biết ngay** mình đang lãi hay lỗ, bao nhiêu, tại sao
- **Giám sát** các bot/chiến lược đang chạy (signal, hiệu suất live vs backtest)
- **Được cảnh báo** kịp thời khi có rủi ro hoặc cơ hội

---

## 2. Tính năng cốt lõi

### A. 📊 Thị trường (Market Data)
| Tính năng | Mô tả | Ưu tiên |
|---|---|---|
| Watchlist real-time | Giá, %24h, volume qua WebSocket | P0 |
| Candlestick chart | Nến multi-timeframe + indicators (MA, EMA, RSI, MACD, Bollinger, VWAP) | P0 |
| Order book depth | Depth chart + danh sách bid/ask | P1 |
| Recent trades tape | Stream lệnh khớp gần nhất | P1 |
| Market scanner | Top gainers/losers, volume spike, breakout detection | P1 |
| Derivatives data | Funding rate, open interest, long/short ratio (futures) | P2 |

### B. 💰 Vị thế & Lệnh (Positions & Orders)
| Tính năng | Mô tả | Ưu tiên |
|---|---|---|
| Open positions | Entry, size, leverage, mark price, liquidation price, PnL unrealized | P0 |
| PnL real-time | Unrealized + realized, cập nhật mỗi tick | P0 |
| Order history | Fills, phí, slippage, thời gian | P0 |
| **Order ticket** | Đặt lệnh Market/Limit/Stop + TP-SL ngay trên app, confirm 2 bước | P0 |
| Pending orders | Limit/stop/TP-SL đang chờ, hủy/sửa từ UI | P1 |
| One-click flatten | Đóng nhanh vị thế / đóng tất cả khi khẩn cấp | P1 |
| Trade journal | Ghi chú lý do vào/ra lệnh, tag theo setup | P2 |

> ⚠️ Full trading = cần **confirmation dialog**, **kill switch**, audit log mọi thao tác đặt/hủy lệnh.

### C. 🤖 Chiến lược (Strategies)
| Tính năng | Mô tả | Ưu tiên |
|---|---|---|
| Strategy dashboard | Danh sách bot/strategy: trạng thái, PnL, số lệnh, win rate | P0 |
| Signals feed | Log tín hiệu vào/ra lệnh kèm lý do (rule triggered) | P1 |
| Live vs Backtest | So sánh hiệu suất thực tế với backtest | P2 |
| Điều khiển từ xa | Bật/tắt strategy, đổi tham số từ UI | P2 |

### D. 📈 Hiệu suất (Performance Analytics)
- Equity curve tổng thể + theo từng strategy/symbol
- Metrics: **Win rate, Profit factor, Max drawdown, Sharpe ratio, Avg win/loss, Expectancy**
- Phân tích theo: khung giờ, ngày trong tuần, side (long/short), symbol

### E. 🔔 Cảnh báo & Risk (Alerts & Risk)
- Alert giá / % thay đổi / RSI vượt ngưỡng / volume spike
- Risk monitor: total exposure, margin usage, drawdown limit → cảnh báo đỏ
- Kênh thông báo: **Telegram** (P0), Discord/Webhook, Email, Push (P2)

### F. 📄 Báo cáo (Reports)
- Báo cáo ngày/tuần/tháng tự động gửi Telegram
- Export CSV/PDF lịch sử giao dịch

---

## 3. Kiến trúc đề xuất

```
                        ┌────────────────────────────┐
                        │   Frontend Dashboard        │
                        │   (Next.js + Lightweight    │
                        │    Charts)                  │
                        └──────────┬─────────────────┘
                                   │ REST + WebSocket
                                   ▼
┌──────────────┐          ┌──────────────────┐
│ Notifier      │◀────────│  Backend API      │
│ (Telegram...) │          │  (FastAPI)        │
└──────────────┘          └───┬──────────┬───┘
                              │          │
              ┌───────────────┘          └────────────────┐
              ▼                                           ▼
   ┌─────────────────────┐                    ┌──────────────────────┐
   │ Market Data Service  │                    │ Execution Gateway     │
   │ (WS feeds, scanner)  │                    │ (place/cancel orders, │
   └──────────┬──────────┘                    │  risk checks, audit)  │
              │                               └──────────┬───────────┘
              ▼                                          │
   ┌─────────────────────┐    ┌──────────────────┐       │
   │ TimescaleDB /        │    │ Strategy Engine   │◀──────┘
   │ PostgreSQL + Redis   │◀──▶│ (pluggable: built- │
   └─────────────────────┘    │  in bots OR external│
                              │  bots via webhook/  │
                              │  API bridge)        │
                              └──────────────────┘
                                        ▲
                              ┌─────────┴─────────┐
                              │ External bots      │
                              │ (webhook/API)      │
                              └───────────────────┘
```

**Adapter Pattern cho đa thị trường:** mỗi sàn/thị trường implement chung 1 interface (`MarketDataAdapter`, `ExecutionAdapter`) → thêm sàn mới không đụng core. Crypto dùng CCXT; chứng khoán VN dùng API riêng của từng CTCK khi tích hợp.

**Strategy Engine mở theo 2 chế độ:**
1. **Built-in strategies** — chạy trong app, cấu hình từ UI.
2. **External bots** — nhận signal qua webhook/API bridge, app chỉ giám sát + hiển thị.

---

## 4. Tech stack đề xuất

| Thành phần | Khuyến nghị | Phương án khác |
|---|---|---|
| Frontend | **Next.js + TypeScript + TailwindCSS + shadcn/ui** | React + Vite |
| Chart | **TradingView Lightweight Charts** (nhẹ, miễn phí, chuẩn trader) | ECharts, Recharts |
| Backend | **Python FastAPI** (hệ sinh thái quant mạnh: pandas, backtesting) | Node.js NestJS |
| Database | **PostgreSQL + TimescaleDB** (dữ liệu chuỗi thời gian) | SQLite cho MVP nhanh |
| Cache/Realtime | **Redis** (pub-sub, cache ticker) | — |
| Exchange connector | **CCXT** (đồng nhất API đa sàn) hoặc SDK native | binance-connector |
| Deploy | Docker Compose trên VPS | Railway/Fly.io |

---

## 5. Roadmap theo phase

### Phase 1 — MVP Monitor + Trade (≈ 2–3 tuần)
- [ ] Kết nối 1 sàn (vd: Binance Futures) — API key đầy đủ quyền, lưu encrypted
- [ ] Watchlist + candlestick chart cơ bản
- [ ] Hiển thị positions + PnL real-time
- [ ] Lịch sử lệnh + fills
- [ ] **Order ticket: đặt Market/Limit + hủy lệnh (có confirm 2 bước)**
- [ ] Equity curve đơn giản

### Phase 2 — Intelligence (≈ 2–3 tuần)
- [ ] Indicators + market scanner
- [ ] Alerts → Telegram
- [ ] Strategy dashboard + signals feed
- [ ] Performance metrics đầy đủ

### Phase 3 — Control & Scale
- [ ] Đa sàn (OKX, Bybit...) qua CCXT
- [ ] Bật/tắt strategy, chỉnh tham số từ UI
- [ ] Backtest UI + so sánh live vs backtest
- [ ] Báo cáo tự động, export

---

## 6. ⚠️ Lưu ý quan trọng

- **Bảo mật API key:** lưu encrypted (env/secret manager), mặc định dùng key **read-only**, chỉ bật quyền trade khi thật sự cần.
- **Rate limit:** mỗi sàn có giới hạn — cần cache + websocket thay vì polling REST.
- **Độ chính xác PnL:** phải tính cả phí + funding, không chỉ giá vào/ra.
- **Timezone:** lưu UTC, hiển thị theo múi giờ user (Asia/Ho_Chi_Minh).

---

## 7. ❓ Câu hỏi còn mở (chốt dần khi triển khai)

1. **Sàn crypto đầu tiên?** Đề xuất Binance Futures (dữ liệu phong phú, API ổn định).
2. **Chứng khoán VN:** tích hợp ở phase nào? (API CTCK không đồng nhất, cần khảo sát riêng)
3. **Auth:** single-user đơn giản (password + session) hay full multi-user từ đầu?
4. **Deploy target:** VPS riêng (Docker Compose) hay cloud service?

---

## 8. 🚀 Bước tiếp theo đề xuất

1. Scaffold project: `frontend/` (Next.js) + `backend/` (FastAPI) + `docker-compose.yml`
2. Implement `MarketDataAdapter` cho Binance (public data trước — không cần API key)
3. Xây dashboard layout: watchlist sidebar + chart trung tâm + panel positions/orders
4. Sau đó mới nối private endpoints (positions, orders, execution)
</content>
