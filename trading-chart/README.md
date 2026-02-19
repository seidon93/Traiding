# Trading Chart Pro

Professional browser-based trading chart application with real-time stock and crypto market data, technical indicators, multi-timeframe analysis, and risk management tools.

## Features

- **Real Market Data** — Stocks via Yahoo Finance, crypto via Binance API
- **1000+ Candlesticks** — Zoom, pan, and scroll through extensive price history
- **8 Timeframes** — 1m, 5m, 15m, 1H, 4H, Daily, Weekly, Monthly
- **Technical Indicators** — SMA, EMA, SMA 200, RSI, MACD, Bollinger Bands, Volume (toggleable with custom colors)
- **Multi-Timeframe Overlay** — Display up to 3 timeframes simultaneously with custom candle colors
- **Market Sessions** — London (9:00–17:30) and US (15:30–22:00) session HLOC markers
- **Risk Management** — Stop Loss calculator with adjustable risk % (default 2%), shown as dashed red line
- **Monday Range** — High / Low / Mid levels from recent Monday (stocks only)
- **Trend Analysis** — Bull/Bear status per timeframe with % change from open
- **Daily Range History** — Visual bars with toggle between % and price view
- **Ticker Search** — Search any stock or crypto, auto-complete results
- **Auto-Refresh** — Quotes update every 30 seconds
- **Dark Theme** — Premium glassmorphism design with modern typography

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js + Express |
| Stock Data | Yahoo Finance v8 API |
| Crypto Data | Binance Public API |
| Charting | [TradingView Lightweight Charts v4](https://github.com/nicholasgasior/lightweight-charts) |
| Frontend | Vanilla HTML / CSS / JavaScript |
| Typography | Inter + JetBrains Mono (Google Fonts) |

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
node server.js
```

Open **http://localhost:3000** in your browser.

## Project Structure

```
trading-chart/
├── server.js          # Express server & API proxy
├── package.json       # Node.js dependencies
└── public/
    ├── index.html     # Main layout
    ├── styles.css     # Dark theme styling
    ├── app.js         # Application controller
    ├── chart.js       # Chart engine (LW Charts)
    ├── data.js        # Data fetching & caching
    ├── indicators.js  # Technical indicator math
    └── sidebar.js     # Sidebar management
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/candles?symbol=AAPL&interval=1d&count=1500` | OHLCV candlestick data |
| `GET /api/candles?symbol=BTCUSDT&interval=1h&type=crypto` | Crypto candles (Binance) |
| `GET /api/quote?symbol=AAPL` | Current price, change %, day range |
| `GET /api/search?q=TSLA` | Ticker search / autocomplete |
| `GET /api/trend?symbol=AAPL` | Bull/Bear trend per timeframe |
| `GET /api/daily-ranges?symbol=AAPL` | Last 30 days daily high-low ranges |
| `GET /api/monday-range?symbol=AAPL` | Monday OHLC range data |

## Usage Tips

- **Search**: Type a ticker in the search bar and press Enter, or click a result
- **Crypto**: Type symbols like `BTCUSDT`, `ETHUSDT`, `SOLUSDT`
- **Zoom**: Use mouse wheel to zoom in/out on the chart
- **Pan**: Click and drag to scroll through history
- **Indicators**: Toggle on/off in the right sidebar, adjust periods and colors
- **Multi-TF**: Enable up to 3 additional timeframes overlaid on the main chart
- **SL Line**: Set your risk % in the left sidebar — red dashed line appears on chart
- **Sessions**: Enable London/US session markers to see HLOC for each session

## Requirements

- Node.js 18+ (LTS recommended)
- Internet connection (for market data APIs)

## License

MIT
