# 📖 HƯỚNG DẪN SỬ DỤNG — Trading Monitor

> Hệ thống đang chạy tại: **http://localhost:3000** (frontend) + **http://localhost:8000** (backend)

---

## 1. 🚀 Khởi động hệ thống

### Cách 1 — Chạy local (đang dùng)

```bash
# Terminal 1: Backend
cd backend
./run.sh

# Terminal 2: Frontend
cd frontend
npm run dev
```

### Cách 2 — Docker (một lệnh duy nhất)

```bash
cp backend/.env.example backend/.env   # lần đầu
docker compose up --build
```

Mở trình duyệt → **http://localhost:3000**

---

## 2. 👀 Chế độ XEM (không cần API key)

Ngay khi mở dashboard, bạn đã thấy được toàn bộ thị trường:

| Panel | Vị trí | Công dụng |
|---|---|---|
| **Watchlist** | Sidebar trái | Top 30 cặp USDT theo volume, giá nhảy real-time |
| **Scanner** | Tab cạnh Watchlist | Top tăng/giảm/volume — click để xem chart |
| **Chart nến** | Trung tâm | Nến live + EMA9/21, đổi timeframe 1m→1d |
| **Order Book** | Phải trên | Sổ lệnh bid/ask với thanh depth |
| **Trades Tape** | Phải trên | Lệnh khớp gần nhất (xanh=mua, đỏ=bán) |
| **Signals Feed** | Dưới phải | Tín hiệu từ 5 strategies, bấm "Quét ngay" |
| **Positions/Orders** | Dưới trái | Vị thế, lệnh chờ, lịch sử (cần API key) |

**Thao tác cơ bản:**
- Click symbol trong Watchlist/Scanner → chart + orderbook + tape chuyển theo
- Click timeframe (15m, 1h...) trên góc chart → đổi khung thời gian
- Bấm "Quét ngay" trong Signals Feed → chạy 5 strategies ngay lập tức

---

## 3. 🔑 Kết nối tài khoản (để trade & xem PnL)

### Bước 1: Lấy API key

**Testnet (an toàn, tiền giả — KHUYÊN DÙNG TRƯỚC):**
1. Vào https://testnet.binancefuture.com → đăng ký
2. Vào tab "API Key" → tạo key
3. Copy API Key + Secret

**Binance thật:** Account → API Management → Create API (bật quyền Futures)

### Bước 2: Cấu hình

```bash
cd backend
cp .env.example .env
nano .env   # hoặc mở bằng editor
```

Điền:
```
BINANCE_API_KEY=your_key_here
BINANCE_API_SECRET=your_secret_here
BINANCE_TESTNET=true        # true = testnet, false = tiền thật!
```

### Bước 3: Restart backend

```bash
pkill -f uvicorn && ./run.sh
```

→ Dashboard giờ hiện: số dư, PnL live, vị thế, lệnh chờ, lịch sử + Risk Panel.

---

## 4. ⚡ Đặt lệnh thủ công

1. Chọn symbol ở Watchlist (vd BTCUSDT)
2. Panel **Đặt lệnh** bên phải:
   - Chọn **Mua/Long** hoặc **Bán/Short**
   - Chọn loại lệnh: Limit / Market / Stop Market / TP Market
   - Nhập **số lượng** + **giá** (nếu Limit)
3. Bấm nút Mua/Bán → **XÁC NHẬN** (confirm 2 bước)
4. Lệnh xuất hiện ngay trong tab "Lệnh chờ" → có thể Hủy

**Đóng vị thế nhanh:** tab "Vị thế" → nút **Đóng** (market close reduce-only).

---

## 5. 🧪 Backtest chiến lược (tìm setup có lợi nhuận)

Vào **http://localhost:3000/backtest** hoặc bấm "🧪 Backtest":

1. Chọn Strategy (5 loại), Symbol, Timeframe, Số nến, Sàn
2. Bấm **▶ Chạy backtest**
3. Đọc kết quả:
   - **Win rate > 50%** và **Profit factor > 1.5** = setup tốt
   - **Max drawdown** thấp = rủi ro kiểm soát được
   - Xem từng trade mô phỏng bên dưới

**Setup đã verify tốt nhất hiện tại:**
```
Strategy: bollinger_breakout
Symbol:   BTCUSDT / ETHUSDT
TF:       15m
→ Win rate 61-71%, PF 7-9, dương trên cả 4 symbols
```

⚠️ Backtest có tính fee 0.05% + slippage nhưng vẫn là quá khứ — luôn testnet trước.

---

## 6. ⚙️ Auto-Trading (bot tự giao dịch)

**KHUYÊN NGHIỆP: chỉ bật sau khi đã backtest + testnet thành công!**

### Bật qua API (curl):

```bash
# Kiểm tra trạng thái
curl http://127.0.0.1:8000/api/autotrade/status

# BẬT: venue binance, TF 15m, risk 1% balance/lệnh
curl -X POST "http://127.0.0.1:8000/api/autotrade/toggle?enabled=true&venue=binance&interval=15m&risk_pct=1"

# TẮT ngay lập tức
curl -X POST "http://127.0.0.1:8000/api/autotrade/toggle?enabled=false"
```

### Bot hoạt động thế nào:
1. Quét signals mỗi ~30s trên các symbol cấu hình
2. Khi có signal **có SL/TP** (trend_pullback, bollinger_breakout, vwap_reversion):
   - Tính qty sao cho **thua đúng X% balance nếu dính SL**
   - Đặt entry MARKET + bracket SL + TP (reduce-only)
3. Guards: không vào symbol đã có vị thế, max 10 vị thế, không trade thiếu stop

### Hoặc chạy dry-run một chu kỳ:
```bash
curl -X POST http://127.0.0.1:8000/api/autotrade/run-once
```

---

## 7. 🛡️ Quản lý rủi ro

**Risk Panel** (dưới header) hiển thị liên tục:
- Drawdown % / giới hạn 10%
- Margin usage % / giới hạn 80%
- Số vị thế / max 10

Khi vượt ngưỡng → **chuyển đỏ + Telegram alert**.

**🛑 KILL SWITCH** — tình huống khẩn cấp (flash crash, bot điên):
1. Bấm nút Kill Switch trên Risk Panel
2. Confirm → đóng TẤT CẢ vị thế market ngay lập tức

Đổi giới hạn trong `backend/.env`:
```
MAX_DRAWDOWN_PCT=10
MAX_MARGIN_USAGE=0.8
MAX_POSITIONS=10
AUTOTRADE_RISK_PCT=1     # % balance risk mỗi lệnh của bot
```

---

## 8. 🔔 Thông báo Telegram

1. Chat với **@BotFather** → `/newbot` → lấy token
2. Chat với **@userinfobot** → lấy chat_id của bạn
3. Gửi 1 tin nhắn bất kỳ cho bot của bạn (để bot được phép nhắn)
4. Điền vào `.env`:
```
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=987654321
```
5. Restart backend

→ Giờ nhận được: signal mới, price alert, risk warning, kill switch, báo cáo.

**Tạo price alert thủ công:**
```bash
curl -X POST http://127.0.0.1:8000/api/alerts \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","op":">=","price":80000}'
```

**Báo cáo hiệu suất:**
```bash
curl -X POST "http://127.0.0.1:8000/api/reports/generate?period=daily"
```

---

## 9. 📓 Trade Journal & 📊 Analytics

**Journal** (`/journal`): ghi lại từng lệnh với setup tag + lý do → học từ sai lầm.
Tổng PnL tự động tính.

**Analytics** (`/analytics`): win rate, profit factor, expectancy, equity curve,
max drawdown — tính từ lệnh thật trên sàn (cần API key).

---

## 10. 🔐 Bảo vệ app khi public (optional)

Nếu expose ra internet, đặt token trong `backend/.env`:
```
API_TOKEN=my-secret-token
```
Restart → mọi API call cần header `Authorization: Bearer my-secret-token`.

---

## 11. 🧩 Workflow khuyến nghị (từ zero đến auto-trade)

```
1. Xem thị trường          → Dashboard (free, không key)
2. Backtest tìm setup      → /backtest (BB breakout 15m hiện tốt nhất)
3. Lấy testnet key         → testnet.binancefuture.com
4. Test đặt lệnh tay       → Order ticket trên testnet
5. Dry-run autotrader      → POST /api/autotrade/run-once
6. Bật autotrader risk 1%  → toggle enabled=true (testnet!)
7. Theo dõi 1-2 tuần       → Signals Feed + Risk Panel + Analytics
8. Nếu ổn định             → BINANCE_TESTNET=false (tiền thật, risk nhỏ)
9. Scale dần               → tăng risk_pct khi win rate thực tế xác nhận
```

---

## ❓ Troubleshooting

| Vấn đề | Nguyên nhân & fix |
|---|---|
| Dashboard trắng / không data | Backend chưa chạy → `cd backend && ./run.sh` |
| "API key not configured" | Điền keys vào backend/.env rồi restart |
| Chart không nhảy | WS bị chặn → check log backend, thử mạng khác |
| Autotrader không vào lệnh | Check `/api/autotrade/status` errors; signal phải có SL/TP |
| PnL analytics trống | Cần đủ lệnh FILLED trên sàn; journal thì luôn có |