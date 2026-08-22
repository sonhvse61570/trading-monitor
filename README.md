# 📈 Trading Monitor

Dashboard giám sát & giao dịch đa thị trường. **Phase 1 MVP**: Binance USD-M Futures.

## Tính năng hiện tại

### Phase 1 — Monitor & Trade
- 📊 Watchlist real-time (WebSocket, top 30 cặp USDT theo volume)
- 🕯️ Candlestick chart multi-timeframe (1m → 1d) + volume
- 📖 Order book depth (poll 2s)
- 💰 Vị thế đang mở + PnL real-time
- 📋 Lệnh chờ (hủy từ UI) + lịch sử lệnh
- ⚡ Order ticket: Market / Limit / Stop / TP (confirm 2 bước)
- 🔒 API key lưu qua biến môi trường, không hardcode

### Phase 2 — Intelligence
- 🧮 Indicators API: EMA/SMA/RSI/MACD/Bollinger/VWAP (pure Python)
- 🔍 Market Scanner: top gainers/losers/volume leaders (tab trong sidebar)
- 🤖 **5 Strategies** (chạy nền mỗi 60s):
  - `rsi_mean_reversion` — RSI(14) 30/70
  - `ma_cross` — EMA9/21 cross
  - `trend_pullback` — EMA50 trend filter + RSI pullback, **SL=1.5×ATR / TP=3×ATR (1:2 RR)**
  - `bollinger_breakout` — BB(20,2) breakout + volume 1.5×, SL=mid band, TP=2×band width
  - `vwap_reversion` — fade ±2% từ rolling VWAP(20)
- 🤖 **Bot Management UI** (`/bot`): điều khiển toàn bộ bot từ trình duyệt —
  bật/tắt autotrader (venue/TF/risk config + confirm 2 bước), Dry-run 1 chu kỳ,
  chạy Optimizer (best params card + top combos), Walk-forward validation
  (verdict màu ROBUST/MARGINAL/OVERFIT + fold breakdown), bảng strategies
- ⚙️ **Auto-Trading Engine**: tự đặt lệnh khi có signal —
  **risk-based sizing** (risk % balance per trade theo stop distance), bracket
  SL+TP reduce-only, guards: max positions / skip symbol đã có vị thế /
  **OFF by default**. Điều khiển trên dashboard hoặc trang Bot
- 🎯 **Parameter Optimizer** (`GET /api/optimize?strategy=&symbol=&interval=`):
  grid-search tham số (27 combos BB breakout, 9 trend pullback, 12 VWAP),
  score = PF × sample confidence → tự tìm setup tốt nhất & loại bỏ strategy kém
- ✅ **Walk-Forward Validation** (`GET /api/walkforward`): chia N folds,
  optimize in-sample → evaluate out-of-sample → verdict **ROBUST / MARGINAL /
  OVERFIT** (BB breakout BTCUSDT 15m hiện: ROBUST, ratio 1.76)
- ⚡ Signals Feed real-time (WS) — built-in strategies + webhook cho bot ngoài:
  `POST /api/signals/webhook {"strategy","symbol","side","reason","price"}`
- 🔔 Price alerts + Telegram notifications (cấu hình TELEGRAM_BOT_TOKEN/CHAT_ID)
- 📈 Trang Analytics: win rate, profit factor, max drawdown, expectancy,
  equity curve, giao dịch FIFO gần nhất (`/analytics`)

### Phase 3 — Multi-venue + Backtest
- 🌐 **3 sàn**: Binance USD-M + OKX + Bybit — **đầy đủ cả public data LẪN execution**
  (đặt/hủy lệnh trên cả 3 sàn; OKX cần `OKX_API_KEY/SECRET/PASSPHRASE`, Bybit cần
  `BYBIT_API_KEY/SECRET` trong backend/.env)
- 🧪 **Backtest UI** (`/backtest`): chạy strategy trên dữ liệu lịch sử bất kỳ sàn,
  xem win rate / PnL / chi tiết giao dịch — **đã tính taker fee + slippage**
- 🛡️ **Risk monitor + Kill Switch**: drawdown guard, margin usage, position count
  — cảnh báo Telegram khi vượt giới hạn (cấu hình `MAX_DRAWDOWN_PCT`,
  `MAX_MARGIN_USAGE`, `MAX_POSITIONS`); Risk panel trên dashboard với nút
  **Kill Switch** đóng tất cả vị thế khẩn cấp (confirm 2 bước)
- 💾 **SQLite persistence**: signals, price alerts & trade journal lưu DB
  (`backend/data/`), tồn tại qua restart; volume mount khi chạy Docker
- 📓 **Trade Journal** (`/journal`): ghi setup tag + notes + PnL cho từng lệnh,
  tổng hợp PnL tự động — lưu SQLite
- 🕯️ **Live candle chart**: nến cập nhật real-time qua WebSocket kline stream
  (không cần reload) + overlay EMA9/EMA21
- 🧾 **Trades tape**: lệnh khớp gần nhất của symbol đang chọn (bên cạnh order book)
- 🔐 **Optional auth**: đặt `API_TOKEN` trong backend/.env để bảo vệ toàn bộ API
  bằng Bearer token (`/api/auth/status` kiểm tra trạng thái)
- 📄 **Reports**: báo cáo daily/weekly/monthly qua Telegram
  (`POST /api/reports/generate?period=daily`)
- 🐳 **Docker Compose**: `docker compose up --build` chạy full stack

## Cấu trúc

```
backend/
  app/adapters/    base.py (interface) + binance/okx/bybit.py
  app/db.py        SQLite persistence (signals, price alerts)
  app/indicators.py  EMA/SMA/RSI/MACD/Bollinger/VWAP
  app/scanner.py   Market scanner
  app/strategies.py  Strategy engine + signal store
  app/backtest.py  Backtester (fees + slippage)
  app/alerts.py    Telegram dispatcher + price alerts
  app/analytics.py Performance metrics (FIFO)
  app/risk.py      Risk monitor (drawdown/margin/count)
  app/reports.py   Scheduled reports
  app/ws_hub.py    Broadcast ticker WS tới mọi client
frontend/          Next.js 15 + TailwindCSS + Lightweight Charts
docs/BRAINSTORM.md Roadmap & kiến trúc tổng thể
```

## Chạy local

### Backend (cần Python 3.11+)

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env        # điền BINANCE_API_KEY / SECRET nếu muốn trade
./run.sh                    # hoặc: .venv/bin/uvicorn app.main:app --port 8000 --reload
```

> Không có API key vẫn xem được toàn bộ dữ liệu thị trường.
> Lấy testnet key tại https://testnet.binancefuture.com để thử đặt lệnh an toàn.

### Frontend (cần Node 18+)

```bash
cd frontend
npm install
npm run dev                 # http://localhost:3000
```

Frontend proxy REST `/api/*` → backend `127.0.0.1:8000`; WebSocket kết nối thẳng backend.

## API chính

| Endpoint | Mô tả |
|---|---|
| `GET /api/market/tickers` | Tất cả ticker 24h |
| `GET /api/market/klines?symbol=&interval=` | Nến OHLCV |
| `GET /api/market/orderbook?symbol=` | Sổ lệnh |
| `GET /api/account?venue=` | Số dư tài khoản (binance/okx/bybit) |
| `GET /api/positions?venue=` | Vị thế đang mở |
| `GET /api/orders/open?venue=` · `/history?venue=` | Lệnh chờ / lịch sử |
| `POST /api/orders?venue=` | Đặt lệnh |
| `DELETE /api/orders/{id}?symbol=&venue=` | Hủy lệnh |
| `GET /api/indicators?symbol=` | EMA/RSI/MACD/Bollinger/VWAP |
| `GET /api/scanner` | Top gainers/losers/volume |
| `GET /api/strategies` · `/api/signals` | Danh sách strategy · signals feed |
| `POST /api/signals/webhook` | Bot ngoài đẩy signal vào app |
| `GET/POST/DELETE /api/alerts` | Quản lý price alerts |
| `GET /api/analytics/performance` | Metrics hiệu suất |
| `POST /api/reports/generate?period=` | Báo cáo hiệu suất → Telegram |
| `GET /api/venues` | Danh sách sàn hỗ trợ |
| `POST /api/backtest` | Chạy backtest strategy (có phí) |
| `GET /api/optimize?strategy=` | Grid-search tham số tối ưu |
| `GET /api/walkforward?strategy=` | Walk-forward validation (chống overfit) |
| `GET /api/risk` · `POST /api/risk/check` | Risk snapshot · force check |
| `GET/POST/DELETE /api/journal` | Trade journal (lưu SQLite) |
| `POST /api/risk/kill-switch?confirm=YES` | 🛑 Đóng TẤT CẢ vị thế khẩn cấp |
| `GET /api/autotrade/status` · `/toggle` · `/run-once` | Auto-trading engine |
| `/bot` | 🤖 Trang quản lý Bot (UI) |
| `GET /api/auth/status` · `POST /api/auth/verify` | Trạng thái / xác thực token |
| `WS /ws` | Stream ticker + signal real-time |
| `WS /ws/candles/{symbol}?interval=` | Stream nến real-time cho 1 symbol |

## 📊 Kết quả backtest (Bollinger Breakout, 1000 nến, fee 0.05% + slippage 2bps)

| Symbol / TF | Trades | Win rate | PnL net | Profit factor |
|---|---|---|---|---|
| **BTCUSDT 15m** | 13 | **61.5%** | **+$12,766** | **9.0** |
| ETHUSDT 15m | 7 | 71.4% | +$513 | 7.7 |
| BTCUSDT 1h | 13 | 38.5% | +$7,454 | 2.2 |
| BNBUSDT 15m | 21 | 38.1% | +$54 | 1.9 |
| SOLUSDT 1h | 13 | 23.1% | -$0.25 | 1.0 |

> Pattern bền vững: breakout + volume expansion dương trên cả 4 symbols ở 15m.
> Chạy lại bất kỳ lúc nào tại `/backtest`. ⚠️ Kết quả quá khứ không bảo đảm tương lai.

> **Báo cáo daily** tự gửi Telegram mỗi ngày UTC mới (khi đã cấu hình bot).

## 🧪 Tests

```bash
cd backend
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest        # 31 tests: indicators, strategies,
                                  # backtest (SL/TP/fees/slippage),
                                  # analytics FIFO, risk snapshot
```

## Deploy với Docker

```bash
cp backend/.env.example backend/.env   # điền keys (tuỳ chọn)
docker compose up --build
# → frontend http://localhost:3000, backend http://localhost:8000
```

## Roadmap tiếp theo

Xem `docs/BRAINSTORM.md` — còn lại: auth multi-user (hiện có bearer token đơn giản),
chứng khoán VN (cần khảo sát API từng CTCK).
