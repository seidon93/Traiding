/* ═══════════════════════════════════════════════════════════════
   DATA.JS — Data fetching and caching layer
   ═══════════════════════════════════════════════════════════════ */

const DataService = (() => {
    const cache = new Map();
    const CACHE_TTL = 60000; // 1 minute

    function cacheKey(endpoint, params) {
        return `${endpoint}?${new URLSearchParams(params).toString()}`;
    }

    function getCached(key) {
        const entry = cache.get(key);
        if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
        return null;
    }

    function setCache(key, data) {
        cache.set(key, { data, ts: Date.now() });
    }

    async function fetchJSON(endpoint, params = {}) {
        const key = cacheKey(endpoint, params);
        const cached = getCached(key);
        if (cached) return cached;

        const url = `${endpoint}?${new URLSearchParams(params).toString()}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`API error: ${resp.status}`);
        const data = await resp.json();
        setCache(key, data);
        return data;
    }

    function isCrypto(symbol) {
        return symbol.toUpperCase().endsWith('USDT') ||
            symbol.toUpperCase().endsWith('BUSD') ||
            symbol.toUpperCase().endsWith('BTC') && symbol.length > 5;
    }

    async function getCandles(symbol, interval = '1d', count = 1500) {
        const type = isCrypto(symbol) ? 'crypto' : 'stock';
        return fetchJSON('/api/candles', { symbol, interval, count, type });
    }

    async function getQuote(symbol) {
        const type = isCrypto(symbol) ? 'crypto' : 'stock';
        return fetchJSON('/api/quote', { symbol, type });
    }

    async function searchTicker(query) {
        if (!query || query.length < 1) return [];
        // Don't cache search results
        const url = `/api/search?q=${encodeURIComponent(query)}`;
        const resp = await fetch(url);
        if (!resp.ok) return [];
        return resp.json();
    }

    async function getMondayRange(symbol) {
        return fetchJSON('/api/monday-range', { symbol });
    }

    async function getTrend(symbol) {
        const type = isCrypto(symbol) ? 'crypto' : 'stock';
        return fetchJSON('/api/trend', { symbol, type });
    }

    async function getDailyRanges(symbol) {
        return fetchJSON('/api/daily-ranges', { symbol });
    }

    return { getCandles, getQuote, searchTicker, getMondayRange, getTrend, getDailyRanges, isCrypto };
})();
