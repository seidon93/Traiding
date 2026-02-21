/* ═══════════════════════════════════════════════════════════════
   APP.JS — Main application controller
   ═══════════════════════════════════════════════════════════════ */

(() => {
    // ─── State ─────────────────────────────────────────────
    let currentSymbol = 'ASML.AS';
    let currentInterval = '1d';
    let currentType = 'stock';
    let refreshTimer = null;
    let searchDebounce = null;

    // ─── Boot ──────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        ChartEngine.init();
        Sidebar.initEvents();
        setupSearch();
        setupTimeframes();

        // Initial load
        loadTicker(currentSymbol);
    });

    // ─── Load Ticker (full data refresh) ──────────────────
    async function loadTicker(symbol) {
        currentSymbol = symbol.toUpperCase();
        currentType = DataService.isCrypto(currentSymbol) ? 'crypto' : 'stock';

        document.getElementById('tickerSymbol').textContent = currentSymbol;
        document.getElementById('tickerName').textContent = 'Loading…';
        document.getElementById('tickerPrice').textContent = '—';
        document.getElementById('tickerChange').textContent = '—';
        document.getElementById('tickerChange').className = 'ticker-change';

        // Hide Monday range panel for crypto
        const mondayPanel = document.getElementById('mondayRangePanel');
        mondayPanel.style.display = currentType === 'crypto' ? 'none' : 'block';

        // Load all data in parallel
        try {
            const [candleResult, quoteResult] = await Promise.allSettled([
                DataService.getCandles(currentSymbol, currentInterval, 1500),
                DataService.getQuote(currentSymbol)
            ]);

            // Set candles
            if (candleResult.status === 'fulfilled' && candleResult.value.candles) {
                ChartEngine.setData(candleResult.value.candles);
            }

            // Set quote info
            if (quoteResult.status === 'fulfilled') {
                updateQuoteDisplay(quoteResult.value);
            }
        } catch (e) {
            console.error('Failed to load ticker:', e);
        }

        // Load sidebar data (non-blocking)
        Sidebar.updateTrend(currentSymbol);
        Sidebar.updateDailyRanges(currentSymbol);
        if (currentType !== 'crypto') {
            Sidebar.updateMondayRange(currentSymbol);
        }

        // Re-apply session markers if enabled
        if (document.getElementById('londonSession').checked) {
            ChartEngine.addSessionMarkers(ChartEngine.getData(), 'london');
        }
        if (document.getElementById('usSession').checked) {
            ChartEngine.addSessionMarkers(ChartEngine.getData(), 'us');
        }

        // Re-apply MTF overlays if enabled
        for (let i = 1; i <= 3; i++) {
            const toggle = document.getElementById(`mtf${i}Enabled`);
            if (toggle && toggle.checked) {
                const select = document.getElementById(`mtf${i}Select`);
                const upColor = document.getElementById(`mtf${i}UpColor`);
                const downColor = document.getElementById(`mtf${i}DownColor`);
                Sidebar.loadMTFOverlay(i, select.value, upColor.value, downColor.value);
            }
        }

        // Set up auto-refresh
        setupAutoRefresh();
    }

    function updateQuoteDisplay(quote) {
        document.getElementById('tickerName').textContent = quote.name || quote.symbol || '';
        document.getElementById('tickerPrice').textContent = ChartEngine.fmt(quote.price);

        const pct = quote.changePercent;
        const changeEl = document.getElementById('tickerChange');
        if (pct != null) {
            const sign = pct >= 0 ? '+' : '';
            changeEl.textContent = `${sign}${pct.toFixed(2)}%`;
            changeEl.className = `ticker-change ${pct >= 0 ? 'up' : 'down'}`;
        }

        // Update current price line on chart
        if (quote.price) {
            ChartEngine.setCurrentPriceLine(quote.price);
        }

        // Update SL with current price
        Sidebar.updateSL(quote.price);
    }

    // ─── Auto Refresh ─────────────────────────────────────
    function setupAutoRefresh() {
        if (refreshTimer) clearInterval(refreshTimer);

        // Refresh quote every 30 seconds
        refreshTimer = setInterval(async () => {
            try {
                const quote = await DataService.getQuote(currentSymbol);
                updateQuoteDisplay(quote);
            } catch (e) { /* silent */ }
        }, 30000);
    }

    // ─── Search ───────────────────────────────────────────
    function setupSearch() {
        const input = document.getElementById('tickerInput');
        const results = document.getElementById('searchResults');

        input.addEventListener('input', () => {
            const query = input.value.trim();
            if (searchDebounce) clearTimeout(searchDebounce);

            if (query.length < 1) {
                results.classList.remove('open');
                results.innerHTML = '';
                return;
            }

            searchDebounce = setTimeout(async () => {
                try {
                    const items = await DataService.searchTicker(query);
                    if (!items || items.length === 0) {
                        results.innerHTML = '<div class="search-item"><span class="name">No results</span></div>';
                        results.classList.add('open');
                        return;
                    }

                    results.innerHTML = items.map(item => {
                        const isCrypto = item.type === 'CRYPTO' || item.type === 'CRYPTOCURRENCY';
                        return `<div class="search-item" data-symbol="${item.symbol}" data-type="${item.type}">
              <div>
                <span class="symbol">${item.symbol}</span>
                <span class="name">${item.name || ''}</span>
              </div>
              <span class="type-badge ${isCrypto ? 'crypto' : ''}">${item.exchange || item.type || ''}</span>
            </div>`;
                    }).join('');

                    results.classList.add('open');

                    // Click handlers
                    results.querySelectorAll('.search-item').forEach(el => {
                        el.addEventListener('click', () => {
                            const sym = el.dataset.symbol;
                            if (sym) {
                                input.value = '';
                                results.classList.remove('open');
                                loadTicker(sym);
                            }
                        });
                    });
                } catch (e) {
                    console.error('Search error:', e);
                }
            }, 300);
        });

        // Submit on Enter
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = input.value.trim().toUpperCase();
                if (val) {
                    input.value = '';
                    results.classList.remove('open');
                    loadTicker(val);
                }
            }
        });

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                results.classList.remove('open');
            }
        });
    }

    // ─── Timeframe Buttons ────────────────────────────────
    function setupTimeframes() {
        const bar = document.getElementById('timeframeBar');
        bar.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                bar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentInterval = btn.dataset.tf;
                loadCandles();
            });
        });
    }

    async function loadCandles() {
        try {
            const data = await DataService.getCandles(currentSymbol, currentInterval, 1500);
            if (data && data.candles) {
                ChartEngine.setData(data.candles);

                // Re-apply sessions
                if (document.getElementById('londonSession').checked) {
                    ChartEngine.addSessionMarkers(data.candles, 'london');
                }
                if (document.getElementById('usSession').checked) {
                    ChartEngine.addSessionMarkers(data.candles, 'us');
                }
            }
        } catch (e) {
            console.error('Failed to load candles:', e);
        }
    }
})();
