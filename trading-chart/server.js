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
  const { symbol, type = 'stock' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    if (type === 'crypto') {
      // Binance daily klines
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=1d&limit=30`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.code) throw new Error(data.msg || 'Binance API error');

      const ranges = data.map(k => {
        const o = parseFloat(k[1]);
        const h = parseFloat(k[2]);
        const l = parseFloat(k[3]);
        const c = parseFloat(k[4]);
        return {
          date: new Date(k[0]).toISOString(),
          open: o, high: h, low: l, close: c,
          range: h - l,
          rangePercent: ((h - l) / l * 100).toFixed(2)
        };
      });
      return res.json(ranges);
    }

    // Stock daily ranges via Yahoo Finance
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
        open: o, high: h, low: l, close: c,
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

// ─── Price prediction ───────────────────────────────────────────────
app.get('/api/prediction', async (req, res) => {
  const { symbol, type = 'stock' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  try {
    // Define timeframe groups
    const shortTermTFs = [
      { tf: '5m', label: '5m' },
      { tf: '15m', label: '15m' },
      { tf: '1h', label: '1H' }
    ];
    const longTermTFs = [
      { tf: '4h', label: '4H' },
      { tf: '1d', label: 'D' },
      { tf: '1wk', label: 'W' }
    ];

    const allTFs = [...shortTermTFs, ...longTermTFs];
    const tfData = {};

    // Fetch candle data for each timeframe
    for (const { tf } of allTFs) {
      try {
        const candles = await fetchCandlesForTF(symbol, tf, type);
        if (candles && candles.length >= 15) {
          const atr = calcATR(candles, 14);
          const trend = detectTrend(candles);
          const sr = findSupportResistance(candles);
          const lastClose = candles[candles.length - 1].close;
          const lastHigh = candles[candles.length - 1].high;
          const lastLow = candles[candles.length - 1].low;
          tfData[tf] = { atr, trend, sr, lastClose, lastHigh, lastLow, candles };
        }
      } catch (e) { /* skip failed TF */ }
    }

    // Get current price
    const anyTF = Object.values(tfData)[0];
    if (!anyTF) throw new Error('No data available for prediction');
    const currentPrice = anyTF.lastClose;

    // Build predictions for each group
    const shortTerm = buildPrediction(shortTermTFs, tfData, currentPrice, 'short-term');
    const longTerm = buildPrediction(longTermTFs, tfData, currentPrice, 'long-term');

    res.json({ currentPrice, shortTerm, longTerm });
  } catch (e) {
    console.error('Prediction error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Helper: fetch candles for a specific timeframe
async function fetchCandlesForTF(symbol, tf, type) {
  if (type === 'crypto') {
    const intervalMap = { '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1wk': '1w' };
    const binInterval = intervalMap[tf] || '1d';
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${binInterval}&limit=100`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.code) return null;
    return data.map(k => ({
      time: Math.floor(k[0] / 1000),
      open: parseFloat(k[1]), high: parseFloat(k[2]),
      low: parseFloat(k[3]), close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  } else {
    const intervalMap = { '5m': '5m', '15m': '15m', '1h': '60m', '4h': '60m', '1d': '1d', '1wk': '1wk' };
    const rangeMap = { '5m': '60d', '15m': '60d', '1h': '2y', '4h': '2y', '1d': '10y', '1wk': 'max' };
    const yhInterval = intervalMap[tf] || '1d';
    const range = rangeMap[tf] || '1y';
    const url = `${YF_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${yhInterval}&range=${range}&includePrePost=false`;
    const data = await yfFetch(url);
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp || [];
    const ohlcv = result.indicators?.quote?.[0] || {};
    let candles = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = ohlcv.open?.[i], h = ohlcv.high?.[i], l = ohlcv.low?.[i], c = ohlcv.close?.[i];
      if (o != null && h != null && l != null && c != null) {
        candles.push({ time: timestamps[i], open: o, high: h, low: l, close: c, volume: ohlcv.volume?.[i] || 0 });
      }
    }

    // Build 4h from 1h
    if (tf === '4h') candles = build4hCandles(candles);

    // Only keep last 100 candles
    if (candles.length > 100) candles = candles.slice(-100);
    return candles;
  }
}

// ATR(14) calculation
function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return 0;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trs.push(tr);
  }
  // Simple moving average of TR for the last `period` values
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

// Trend detection using EMA crossover + price position
function detectTrend(candles) {
  const closes = candles.map(c => c.close);
  const ema8 = calcEMA(closes, 8);
  const ema21 = calcEMA(closes, 21);

  const lastEma8 = ema8[ema8.length - 1];
  const lastEma21 = ema21[ema21.length - 1];
  const lastClose = closes[closes.length - 1];

  // Trend strength: how far EMAs are apart relative to price
  const emaDiff = (lastEma8 - lastEma21) / lastClose;
  const priceAboveEma = lastClose > lastEma21;

  let direction = 'neutral';
  let strength = 0;

  if (lastEma8 > lastEma21 && priceAboveEma) {
    direction = 'bull';
    strength = Math.min(1, Math.abs(emaDiff) * 50);
  } else if (lastEma8 < lastEma21 && !priceAboveEma) {
    direction = 'bear';
    strength = Math.min(1, Math.abs(emaDiff) * 50);
  } else {
    direction = emaDiff > 0 ? 'bull' : 'bear';
    strength = Math.min(0.5, Math.abs(emaDiff) * 30);
  }

  return { direction, strength };
}

// EMA calculation
function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const ema = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

// Find support and resistance from swing points
function findSupportResistance(candles) {
  const highs = [], lows = [];
  const lookback = Math.min(candles.length, 50);
  const recent = candles.slice(-lookback);

  for (let i = 2; i < recent.length - 2; i++) {
    // Swing high
    if (recent[i].high > recent[i - 1].high && recent[i].high > recent[i - 2].high &&
      recent[i].high > recent[i + 1].high && recent[i].high > recent[i + 2].high) {
      highs.push(recent[i].high);
    }
    // Swing low
    if (recent[i].low < recent[i - 1].low && recent[i].low < recent[i - 2].low &&
      recent[i].low < recent[i + 1].low && recent[i].low < recent[i + 2].low) {
      lows.push(recent[i].low);
    }
  }

  // Use nearest support/resistance
  const lastClose = candles[candles.length - 1].close;
  const resistance = highs.filter(h => h > lastClose).sort((a, b) => a - b);
  const support = lows.filter(l => l < lastClose).sort((a, b) => b - a);

  return {
    resistance: resistance[0] || null,
    support: support[0] || null,
    allResistance: resistance.slice(0, 3),
    allSupport: support.slice(0, 3)
  };
}

// Build prediction for a group of timeframes
function buildPrediction(tfGroup, tfData, currentPrice, mode) {
  const available = tfGroup.filter(t => tfData[t.tf]);
  if (available.length === 0) return null;

  // Consensus
  let bullCount = 0, bearCount = 0, totalStrength = 0;
  let weightedATR = 0, totalWeight = 0;

  for (let i = 0; i < available.length; i++) {
    const d = tfData[available[i].tf];
    const weight = i + 1; // Higher TF gets more weight
    if (d.trend.direction === 'bull') bullCount++;
    else if (d.trend.direction === 'bear') bearCount++;
    totalStrength += d.trend.strength * weight;
    weightedATR += d.atr * weight;
    totalWeight += weight;
  }

  const avgATR = weightedATR / totalWeight;
  const avgStrength = totalStrength / totalWeight;
  const consensus = bullCount > bearCount ? 'bull' : bearCount > bullCount ? 'bear' : 'neutral';
  const confidence = Math.round((Math.max(bullCount, bearCount) / available.length) * 100);

  // ATR multipliers: higher for long-term, lower for short-term
  const targetMultiplier = mode === 'long-term' ? 2.5 : 1.5;
  const slMultiplier = 1.0; // Default SL = 1× ATR (adjustable client-side)

  // Per-TF breakdown
  const timeframes = available.map(t => {
    const d = tfData[t.tf];
    return {
      label: t.label,
      tf: t.tf,
      trend: d.trend.direction,
      strength: Math.round(d.trend.strength * 100),
      atr: parseFloat(d.atr.toFixed(4)),
      lastClose: d.lastClose
    };
  });

  // Long prediction
  const longEntry = currentPrice;
  const longTarget = currentPrice + avgATR * targetMultiplier;
  const longSL = currentPrice - avgATR * slMultiplier;

  // Short prediction
  const shortEntry = currentPrice;
  const shortTarget = currentPrice - avgATR * targetMultiplier;
  const shortSL = currentPrice + avgATR * slMultiplier;

  // Find S/R from the highest TF available
  const highestTF = available[available.length - 1];
  const sr = tfData[highestTF.tf].sr;

  return {
    consensus,
    confidence,
    avgATR: parseFloat(avgATR.toFixed(4)),
    avgStrength: Math.round(avgStrength * 100),
    timeframes,
    long: {
      entry: parseFloat(longEntry.toFixed(4)),
      target: parseFloat(longTarget.toFixed(4)),
      sl: parseFloat(longSL.toFixed(4)),
      rr: parseFloat((targetMultiplier / slMultiplier).toFixed(1))
    },
    short: {
      entry: parseFloat(shortEntry.toFixed(4)),
      target: parseFloat(shortTarget.toFixed(4)),
      sl: parseFloat(shortSL.toFixed(4)),
      rr: parseFloat((targetMultiplier / slMultiplier).toFixed(1))
    },
    support: sr.support ? parseFloat(sr.support.toFixed(4)) : null,
    resistance: sr.resistance ? parseFloat(sr.resistance.toFixed(4)) : null
  };
}

app.listen(PORT, () => {
  console.log(`🚀 Trading Chart server running at http://localhost:3000`);

});
