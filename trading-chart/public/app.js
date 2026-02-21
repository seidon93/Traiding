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
    let nativeCurrency = 'EUR';   // detected from quote response
    let lastRawPrice = null;
    let budgetRateCache = {};     // cache budget exchange rates

    // ─── Boot ──────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        ChartEngine.init();
        Sidebar.initEvents();
        setupSearch();
        setupTimeframes();
        setupChartToolbar();
        setupBudgetCalculator();

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

        // Reset currency to native on ticker change
        ChartEngine.setCurrency(null, null);
        budgetRateCache = {};

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

            // Set quote info — also detects native currency
            if (quoteResult.status === 'fulfilled') {
                const quote = quoteResult.value;

                // ── Detect native currency from quote ──
                if (quote.currency) {
                    nativeCurrency = quote.currency.toUpperCase();
                } else if (currentType === 'crypto') {
                    nativeCurrency = 'USD';
                } else {
                    nativeCurrency = 'USD';
                }

                // Update the native button label
                const nativeBtn = document.querySelector('.currency-btn[data-currency="native"]');
                if (nativeBtn) {
                    nativeBtn.textContent = nativeCurrency;
                    // Reset all currency buttons
                    document.querySelectorAll('.currency-btn').forEach(b => b.classList.remove('active'));
                    nativeBtn.classList.add('active');

                    // Only hide the specific currency button that duplicates the native
                    document.querySelectorAll('.currency-btn:not([data-currency="native"])').forEach(btn => {
                        btn.style.display = btn.dataset.currency === nativeCurrency ? 'none' : '';
                    });
                }

                updateQuoteDisplay(quote);
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

        // Recalculate budget
        recalcBudget();
    }

    function updateQuoteDisplay(quote) {
        document.getElementById('tickerName').textContent = quote.name || quote.symbol || '';

        // Apply currency conversion to displayed price
        const curr = ChartEngine.getActiveCurrency();
        const displayPrice = curr ? quote.price * curr.rate : quote.price;
        document.getElementById('tickerPrice').textContent = ChartEngine.fmt(displayPrice);

        const pct = quote.changePercent;
        const changeEl = document.getElementById('tickerChange');
        if (pct != null) {
            const sign = pct >= 0 ? '+' : '';
            changeEl.textContent = `${sign}${pct.toFixed(2)}%`;
            changeEl.className = `ticker-change ${pct >= 0 ? 'up' : 'down'}`;
        }

        // Update current price line on chart (converted)
        if (quote.price) {
            const linePrice = curr ? quote.price * curr.rate : quote.price;
            ChartEngine.setCurrentPriceLine(linePrice);
        }

        // Update SL with current price
        Sidebar.updateSL(quote.price);

        // Store raw price for currency recalc & budget
        lastRawPrice = quote.price;

        // Recalculate budget with new price
        recalcBudget();
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

    // ─── Chart Toolbar (% + Currency) ────────────────────
    function setupChartToolbar() {
        // Percent mode toggle
        const btnPercent = document.getElementById('btnPercent');
        btnPercent.addEventListener('click', () => {
            const isActive = btnPercent.classList.toggle('active');
            ChartEngine.togglePercentMode(isActive);
        });

        // Currency buttons
        const currencyBtns = document.querySelectorAll('.currency-btn');
        currencyBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                if (btn.classList.contains('active')) return;

                currencyBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const targetCurrency = btn.dataset.currency;

                if (targetCurrency === 'native') {
                    // Reset to native (no conversion)
                    ChartEngine.setCurrency(null, null);
                    if (lastRawPrice) {
                        document.getElementById('tickerPrice').textContent = ChartEngine.fmt(lastRawPrice);
                        ChartEngine.setCurrentPriceLine(lastRawPrice);
                    }
                } else {
                    // Fetch exchange rate from native -> target
                    try {
                        const resp = await fetch(`/api/exchange-rate?from=${nativeCurrency}&to=${targetCurrency}`);
                        const data = await resp.json();
                        if (data.rate) {
                            ChartEngine.setCurrency(targetCurrency, data.rate);
                            if (lastRawPrice) {
                                const converted = lastRawPrice * data.rate;
                                document.getElementById('tickerPrice').textContent = ChartEngine.fmt(converted);
                                ChartEngine.setCurrentPriceLine(converted);
                            }
                        }
                    } catch (e) {
                        console.error('Currency conversion error:', e);
                    }
                }
            });
        });
    }

    // ─── Budget Calculator ───────────────────────────────
    function setupBudgetCalculator() {
        const amountInput = document.getElementById('budgetAmount');
        const currencySelect = document.getElementById('budgetCurrency');

        amountInput.addEventListener('input', () => recalcBudget());
        currencySelect.addEventListener('change', () => recalcBudget());
    }

    async function recalcBudget() {
        const amountInput = document.getElementById('budgetAmount');
        const currencySelect = document.getElementById('budgetCurrency');
        const sharesEl = document.getElementById('budgetShares');
        const priceEl = document.getElementById('budgetPricePerShare');
        const costEl = document.getElementById('budgetTotalCost');
        const remainEl = document.getElementById('budgetRemaining');

        const budget = parseFloat(amountInput.value);
        const budgetCurr = currencySelect.value;

        if (!budget || budget <= 0 || !lastRawPrice || lastRawPrice <= 0) {
            sharesEl.textContent = '—';
            priceEl.textContent = '—';
            costEl.textContent = '—';
            remainEl.textContent = '—';
            return;
        }

        // Price is in native currency. Budget might be in a different currency.
        // Convert budget to native currency to calculate shares.
        let budgetInNative = budget;

        if (budgetCurr !== nativeCurrency) {
            const key = `${budgetCurr}_${nativeCurrency}`;
            if (budgetRateCache[key]) {
                budgetInNative = budget * budgetRateCache[key];
            } else {
                try {
                    const resp = await fetch(`/api/exchange-rate?from=${budgetCurr}&to=${nativeCurrency}`);
                    const data = await resp.json();
                    if (data.rate) {
                        budgetRateCache[key] = data.rate;
                        budgetInNative = budget * data.rate;
                    }
                } catch (e) {
                    console.error('Budget rate error:', e);
                    return;
                }
            }
        }

        const shares = Math.floor(budgetInNative / lastRawPrice);
        const totalCost = shares * lastRawPrice;
        const remaining = budgetInNative - totalCost;

        // Format with native currency symbol
        const currSymbol = getCurrencySymbol(nativeCurrency);
        const budgetSymbol = getCurrencySymbol(budgetCurr);

        sharesEl.textContent = shares.toLocaleString();
        priceEl.textContent = `${currSymbol}${ChartEngine.fmt(lastRawPrice)}`;
        costEl.textContent = `${currSymbol}${ChartEngine.fmt(totalCost)}`;
        remainEl.textContent = `${budgetSymbol}${ChartEngine.fmt(remaining / (budgetRateCache[`${budgetCurr}_${nativeCurrency}`] || 1))}`;
    }

    function getCurrencySymbol(code) {
        const map = { USD: '$', EUR: '€', GBP: '£', CZK: 'Kč ' };
        return map[code] || code + ' ';
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
