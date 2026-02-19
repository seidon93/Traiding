const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Yahoo Finance v8 chart API (direct HTTP) ──────────────────────
const YF_BASE = 'https://query1.finance.yahoo.com';

async function yfFetch(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
  });
  if (!resp.ok) throw new Error(`Yahoo Finance API error: ${resp.status} ${resp.statusText}`);
  return resp.json();
}

// ─── Stock candle data ──────────────────────────────────────────────
app.get('/api/candles', async (req, res) => {
  const { symbol, interval, count = 1500, type = 'stock' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    if (type === 'crypto') {
      return await getCryptoCandles(req, res, symbol, interval, parseInt(count));
    }
    return await getStockCandles(req, res, symbol, interval, parseInt(count));
  } catch (e) {
    console.error('Candle error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

async function getStockCandles(req, res, symbol, interval, count) {
  const intervalMap = {
    '1m': '1m', '5m': '5m', '15m': '15m',
    '1h': '60m', '4h': '60m',
    '1d': '1d', '1wk': '1wk', '1mo': '1mo'
  };
  const yhInterval = intervalMap[interval] || '1d';

  // Determine range based on interval
  let range;
  switch (interval) {
    case '1m': range = '7d'; break;
    case '5m': range = '60d'; break;
    case '15m': range = '60d'; break;
    case '1h': case '4h': range = '2y'; break;
    case '1d': range = '10y'; break;
    case '1wk': range = 'max'; break;
    case '1mo': range = 'max'; break;
    default: range = '5y';
  }

  const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${yhInterval}&range=${range}&includePrePost=false`;
  const data = await yfFetch(url);

  const result = data.chart?.result?.[0];
  if (!result) throw new Error('No data returned from Yahoo Finance');

  const timestamps = result.timestamp || [];
  const ohlcv = result.indicators?.quote?.[0] || {};
  const meta = result.meta || {};

  let candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = ohlcv.open?.[i];
    const h = ohlcv.high?.[i];
    const l = ohlcv.low?.[i];
    const c = ohlcv.close?.[i];
    const v = ohlcv.volume?.[i];
    if (o != null && h != null && l != null && c != null) {
      candles.push({ time: timestamps[i], open: o, high: h, low: l, close: c, volume: v || 0 });
    }
  }

  // Build 4h candles from 1h data
  if (interval === '4h') {
    candles = build4hCandles(candles);
  }

  if (candles.length > count) {
    candles = candles.slice(candles.length - count);
  }

  res.json({ candles, meta: { symbol: meta.symbol, currency: meta.currency, exchangeName: meta.exchangeName, instrumentType: meta.instrumentType } });
}

function build4hCandles(hourlyCandles) {
  const grouped = {};
  for (const c of hourlyCandles) {
    const d = new Date(c.time * 1000);
    const block = Math.floor(d.getUTCHours() / 4);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${block}`;
    if (!grouped[key]) {
      grouped[key] = { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
    } else {
      grouped[key].high = Math.max(grouped[key].high, c.high);
      grouped[key].low = Math.min(grouped[key].low, c.low);
      grouped[key].close = c.close;
      grouped[key].volume += c.volume;
    }
  }
  return Object.values(grouped).sort((a, b) => a.time - b.time);
}

async function getCryptoCandles(req, res, symbol, interval, count) {
  const intervalMap = {
    '1m': '1m', '5m': '5m', '15m': '15m',
    '1h': '1h', '4h': '4h',
    '1d': '1d', '1wk': '1w', '1mo': '1M'
  };
  const binInterval = intervalMap[interval] || '1d';
  const limit = Math.min(count, 1000);

  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${binInterval}&limit=${limit}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.code) throw new Error(data.msg || 'Binance API error');

  const candles = data.map(k => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5])
  }));

  res.json({ candles, meta: { symbol, type: 'crypto' } });
}

// ─── Quote / current price ──────────────────────────────────────────
app.get('/api/quote', async (req, res) => {
  const { symbol, type = 'stock' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    if (type === 'crypto') {
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol.toUpperCase()}`;
      const response = await fetch(url);
      const d = await response.json();
      return res.json({
        price: parseFloat(d.lastPrice),
        open: parseFloat(d.openPrice),
        high: parseFloat(d.highPrice),
        low: parseFloat(d.lowPrice),
        change: parseFloat(d.priceChange),
        changePercent: parseFloat(d.priceChangePercent),
        volume: parseFloat(d.volume),
        symbol: d.symbol,
        name: d.symbol.replace('USDT', '/USDT')
      });
    }

    // Stock quote via Yahoo Finance v8 chart API (1d, 1 data point)
    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&includePrePost=false`;
    const data = await yfFetch(url);

    const result = data.chart?.result?.[0];
    if (!result) throw new Error('No quote data');

    const meta = result.meta || {};
    const quotes = result.indicators?.quote?.[0] || {};
    const timestamps = result.timestamp || [];

    // Get today's data (last entry)
    const last = timestamps.length - 1;
    const prevClose = meta.chartPreviousClose || meta.previousClose;
    const price = meta.regularMarketPrice || quotes.close?.[last];
    const open = quotes.open?.[last] || meta.regularMarketOpen;

    const change = prevClose ? price - prevClose : 0;
    const changePct = prevClose ? ((price - prevClose) / prevClose * 100) : 0;

    res.json({
      price,
      open,
      high: meta.regularMarketDayHigh || quotes.high?.[last],
      low: meta.regularMarketDayLow || quotes.low?.[last],
      previousClose: prevClose,
      change,
      changePercent: changePct,
      volume: meta.regularMarketVolume || quotes.volume?.[last],
      symbol: meta.symbol || symbol,
      name: meta.shortName || meta.longName || symbol,
      exchange: meta.exchangeName,
      currency: meta.currency
    });
  } catch (e) {
    console.error('Quote error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Ticker search ──────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q required' });

  try {
    const url = `${YF_BASE}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0`;
    const data = await yfFetch(url);

    const items = (data.quotes || []).slice(0, 15).map(r => ({
      symbol: r.symbol,
      name: r.shortname || r.longname || '',
      type: r.quoteType,
      exchange: r.exchange
    }));

    // Add common crypto pairs if query matches
    const cryptoSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'DOTUSDT', 'AVAXUSDT', 'MATICUSDT'];
    const matchedCrypto = cryptoSymbols
      .filter(s => s.toLowerCase().includes(q.toLowerCase()))
      .map(s => ({ symbol: s, name: s.replace('USDT', '/USDT'), type: 'CRYPTO', exchange: 'Binance' }));

    res.json([...matchedCrypto, ...items]);
  } catch (e) {
    console.error('Search error:', e.message);
    // Fallback: return crypto matches only
    const cryptoSymbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT'];
    const matchedCrypto = cryptoSymbols
      .filter(s => s.toLowerCase().includes(q.toLowerCase()))
      .map(s => ({ symbol: s, name: s.replace('USDT', '/USDT'), type: 'CRYPTO', exchange: 'Binance' }));
    res.json(matchedCrypto);
  }
});

// ─── Monday range ───────────────────────────────────────────────────
app.get('/api/monday-range', async (req, res) => {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo&includePrePost=false`;
    const data = await yfFetch(url);

    const result = data.chart?.result?.[0];
    if (!result) throw new Error('No data');

    const timestamps = result.timestamp || [];
    const ohlcv = result.indicators?.quote?.[0] || {};

    const mondays = [];
    for (let i = 0; i < timestamps.length; i++) {
      const d = new Date(timestamps[i] * 1000);
      if (d.getDay() === 1 && ohlcv.open?.[i] != null) {
        const high = ohlcv.high[i];
        const low = ohlcv.low[i];
        mondays.push({
          date: d.toISOString(),
          open: ohlcv.open[i],
          high,
          low,
          close: ohlcv.close[i],
          mid: (high + low) / 2
        });
      }
    }

    const latest = mondays.length > 0 ? mondays[mondays.length - 1] : null;
    res.json({ mondays, latest });
  } catch (e) {
    console.error('Monday range error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Multi-timeframe trend data ─────────────────────────────────────
app.get('/api/trend', async (req, res) => {
  const { symbol, type = 'stock' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    const trends = {};

    if (type === 'crypto') {
      const timeframes = [
        { tf: '1h', interval: '1h' },
        { tf: '4h', interval: '4h' },
        { tf: '1d', interval: '1d' },
        { tf: '1wk', interval: '1w' },
        { tf: '1mo', interval: '1M' }
      ];

      for (const { tf, interval } of timeframes) {
        try {
          const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=2`;
          const response = await fetch(url);
          const data = await response.json();
          if (data.length >= 1) {
            const latest = data[data.length - 1];
            const open = parseFloat(latest[1]);
            const close = parseFloat(latest[4]);
            const pct = ((close - open) / open * 100).toFixed(2);
            trends[tf] = { open, close, changePercent: parseFloat(pct), trend: close >= open ? 'bull' : 'bear' };
          }
        } catch (e) { /* skip */ }
      }
    } else {
      // For stocks, use a single Yahoo chart call with 1mo range, then derive trends
      const timeframes = [
        { tf: '1h', interval: '60m', range: '5d' },
        { tf: '4h', interval: '60m', range: '5d' },
        { tf: '1d', interval: '1d', range: '1mo' },
        { tf: '1wk', interval: '1wk', range: '6mo' },
        { tf: '1mo', interval: '1mo', range: '2y' }
      ];

      for (const { tf, interval, range } of timeframes) {
        try {
          const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=false`;
          const data = await yfFetch(url);
          const result = data.chart?.result?.[0];
          if (!result || !result.timestamp?.length) continue;

          const quotes = result.indicators?.quote?.[0] || {};
          let open, close;

          if (tf === '4h') {
            // Build 4h from 1h
            const last4 = Math.max(0, result.timestamp.length - 4);
            open = quotes.open?.[last4];
            close = quotes.close?.[result.timestamp.length - 1];
          } else {
            const lastIdx = result.timestamp.length - 1;
            open = quotes.open?.[lastIdx];
            close = quotes.close?.[lastIdx];
          }

          if (open && close) {
            const pct = ((close - open) / open * 100).toFixed(2);
            trends[tf] = { open, close, changePercent: parseFloat(pct), trend: close >= open ? 'bull' : 'bear' };
          }
        } catch (e) { /* skip */ }
      }
    }

    res.json(trends);
  } catch (e) {
    console.error('Trend error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Daily ranges history ───────────────────────────────────────────
app.get('/api/daily-ranges', async (req, res) => {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo&includePrePost=false`;
    const data = await yfFetch(url);

    const result = data.chart?.result?.[0];
    if (!result) throw new Error('No data');

    const timestamps = result.timestamp || [];
    const ohlcv = result.indicators?.quote?.[0] || {};

    const ranges = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = ohlcv.open?.[i];
      const h = ohlcv.high?.[i];
      const l = ohlcv.low?.[i];
      const c = ohlcv.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;
      ranges.push({
        date: new Date(timestamps[i] * 1000).toISOString(),
        open: o,
        high: h,
        low: l,
        close: c,
        range: h - l,
        rangePercent: ((h - l) / l * 100).toFixed(2)
      });
    }

    res.json(ranges);
  } catch (e) {
    console.error('Daily ranges error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Trading Chart server running at http://localhost:3000`);
});
