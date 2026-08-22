"""Application configuration loaded from environment variables."""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Central settings. All secrets come from .env — never hardcode."""

    app_name: str = "Trading Monitor"
    host: str = "0.0.0.0"
    port: int = 8000

    # Binance API credentials (optional for public data; required for trading)
    binance_api_key: str = ""
    binance_api_secret: str = ""
    # Testnet by default so we never touch real funds accidentally.
    binance_testnet: bool = True

    # OKX credentials (optional; required for OKX trading)
    okx_api_key: str = ""
    okx_api_secret: str = ""
    okx_passphrase: str = ""

    # Bybit credentials (optional; required for Bybit trading)
    bybit_api_key: str = ""
    bybit_api_secret: str = ""

    # CORS origins allowed to call the API
    cors_origins: str = "http://localhost:3000"

    # Telegram alerts (optional)
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Strategy scanner settings
    scan_symbols: str = "BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT"
    scan_interval_seconds: int = 60

    # Risk limits
    max_drawdown_pct: float = 10.0   # % of wallet balance (unrealized)
    max_margin_usage: float = 0.8    # notional / margin balance
    max_positions: int = 10

    # Backtest cost model
    taker_fee_pct: float = 0.05      # per side, % of notional

    # Optional simple auth: when set, all /api/* requests must send
    # "Authorization: Bearer <token>" (except health & auth endpoints).
    api_token: str = ""

    # Auto-trading engine (OFF by default — enable via API or env)
    autotrade_enabled: bool = False
    autotrade_venue: str = "binance"
    autotrade_interval: str = "15m"
    autotrade_risk_pct: float = 1.0   # % of available balance risked per trade

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()