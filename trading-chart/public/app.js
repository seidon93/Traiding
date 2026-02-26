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
        startCETClock();
        setupAlerts();
        setupTradeJournal();

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
        // Clear alerts on ticker change
        ChartEngine.clearAllAlertLines();
        alerts = [];
        alertHistory = [];
        updateAlertBadge();
        renderAlerts();

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
                    // Reset all currency buttons — all always visible
                    document.querySelectorAll('.currency-btn').forEach(b => {
                        b.classList.remove('active');
                        b.style.display = '';
                    });
                    nativeBtn.classList.add('active');
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

        // Check alerts against current price
        checkAlerts(quote.price);

        // Recalculate budget with new price
        recalcBudget();
    }

    // ─── Auto Refresh ─────────────────────────────────────
    function setupAutoRefresh() {
        if (refreshTimer) clearInterval(refreshTimer);

        // Determine refresh interval based on timeframe
        const fastTFs = ['15s', '30s', '1m', '3m', '5m', '10m', '15m', '30m', '45m'];
        const interval = fastTFs.includes(currentInterval) ? 10000 : 30000;

        refreshTimer = setInterval(async () => {
            try {
                // Refresh both quote and candles
                const [quote] = await Promise.all([
                    DataService.getQuote(currentSymbol),
                    loadCandles()  // silently refresh chart candles
                ]);
                if (quote) updateQuoteDisplay(quote);
            } catch (e) { /* silent */ }
        }, interval);
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
        priceEl.textContent = `${currSymbol}${lastRawPrice.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
        costEl.textContent = `${currSymbol}${totalCost.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
        const remainVal = remaining / (budgetRateCache[`${budgetCurr}_${nativeCurrency}`] || 1);
        remainEl.textContent = `${budgetSymbol}${remainVal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
    }

    function getCurrencySymbol(code) {
        const map = { USD: '$ ', EUR: '€ ', GBP: '£ ', CZK: 'Kč ' };
        return map[code] || code + ' ';
    }

    // ─── CET Clock ────────────────────────────────────────
    function startCETClock() {
        const el = document.getElementById('cetClock');
        function tick() {
            const now = new Date();
            const cetStr = now.toLocaleString('en-GB', {
                timeZone: 'Europe/Berlin',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            el.textContent = cetStr + ' CET';
        }
        tick();
        setInterval(tick, 1000);
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
        const dropdown = document.getElementById('tfDropdown');
        const trigger = document.getElementById('tfDropdownTrigger');

        // Main TF bar buttons
        bar.querySelectorAll(':scope > button[data-tf]').forEach(btn => {
            btn.addEventListener('click', () => {
                setActiveTF(btn);
                currentInterval = btn.dataset.tf;
                loadCandles();
                setupAutoRefresh();
                dropdown.classList.remove('open');
                trigger.classList.remove('open');
            });
        });

        // Dropdown trigger toggle
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
            trigger.classList.toggle('open');
        });

        // Dropdown TF buttons
        dropdown.querySelectorAll('button[data-tf]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                setActiveTF(btn);
                currentInterval = btn.dataset.tf;
                trigger.textContent = btn.textContent;
                trigger.classList.add('active');
                loadCandles();
                setupAutoRefresh();
                dropdown.classList.remove('open');
                trigger.classList.remove('open');
            });
        });

        // Close dropdown on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.tf-dropdown-wrap')) {
                dropdown.classList.remove('open');
                trigger.classList.remove('open');
            }
        });
    }

    function setActiveTF(activeBtn) {
        // Clear active from main bar
        document.querySelectorAll('#timeframeBar > button[data-tf]').forEach(b => b.classList.remove('active'));
        // Clear active from dropdown
        document.querySelectorAll('#tfDropdown button[data-tf]').forEach(b => b.classList.remove('active'));
        // Clear trigger active
        const trigger = document.getElementById('tfDropdownTrigger');
        trigger.classList.remove('active');

        // If from main bar, reset trigger text
        if (activeBtn.closest('#timeframeBar') && !activeBtn.closest('.tf-dropdown')) {
            trigger.textContent = '▾';
        }

        activeBtn.classList.add('active');
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

    // ─── Price Alert System ──────────────────────────────
    let alerts = [];        // { id, price, color, visible }
    let alertHistory = [];  // { price, color, time }
    let alertIdCounter = 0;
    let editingAlertId = null;
    let repeatInterval = null;

    function setupAlerts() {
        const bellBtn = document.getElementById('alertBellBtn');
        const panel = document.getElementById('alertPanel');
        const addBtn = document.getElementById('addAlertBtn');
        const priceInput = document.getElementById('alertPrice');
        const colorInput = document.getElementById('alertColor');
        const volSlider = document.getElementById('alertVolume');
        const volLabel = document.getElementById('alertVolLabel');
        const clearHistBtn = document.getElementById('clearAlertHistory');

        // Toggle panel
        bellBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('open');
            document.getElementById('tradePanel')?.classList.remove('open');
        });

        // Close panel on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.alert-bell-wrap')) {
                panel.classList.remove('open');
            }
        });

        // Add/edit alert
        addBtn.addEventListener('click', () => {
            const price = parseFloat(priceInput.value);
            if (!price || price <= 0) return;
            if (editingAlertId !== null) {
                // Edit existing alert
                const a = alerts.find(x => x.id === editingAlertId);
                if (a) {
                    ChartEngine.removeAlertLine(a.id);
                    a.price = price;
                    a.color = colorInput.value;
                    if (a.visible) ChartEngine.addAlertLine(a.id, a.price, a.color);
                }
                editingAlertId = null;
                addBtn.textContent = '+';
            } else {
                addAlert(price, colorInput.value);
            }
            priceInput.value = '';
            renderAlerts();
        });

        // Enter key
        priceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addBtn.click();
        });

        // Volume slider
        volSlider.addEventListener('input', () => {
            volLabel.textContent = volSlider.value + '%';
        });

        // Clear history
        clearHistBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            alertHistory = [];
            renderAlerts();
        });

        // Load from localStorage
        loadAlertsFromStorage();
    }

    function addAlert(price, color) {
        const id = ++alertIdCounter;
        alerts.push({ id, price, color, visible: true });
        ChartEngine.addAlertLine(id, price, color);
        updateAlertBadge();
        renderAlerts();
        saveAlertsToStorage();
    }

    function removeAlert(id) {
        alerts = alerts.filter(a => a.id !== id);
        ChartEngine.removeAlertLine(id);
        updateAlertBadge();
        renderAlerts();
        saveAlertsToStorage();
    }

    function toggleAlertVisibility(id) {
        const a = alerts.find(x => x.id === id);
        if (!a) return;
        a.visible = !a.visible;
        if (a.visible) {
            ChartEngine.addAlertLine(a.id, a.price, a.color);
        } else {
            ChartEngine.removeAlertLine(a.id);
        }
        renderAlerts();
        saveAlertsToStorage();
    }

    function startEditAlert(id) {
        const a = alerts.find(x => x.id === id);
        if (!a) return;
        document.getElementById('alertPrice').value = a.price;
        document.getElementById('alertColor').value = a.color;
        document.getElementById('addAlertBtn').textContent = '✓';
        editingAlertId = id;
    }

    function updateAlertBadge() {
        const badge = document.getElementById('alertBadge');
        const count = alerts.filter(a => a.visible).length;
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    function renderAlerts() {
        const activeList = document.getElementById('alertActiveList');
        const historyList = document.getElementById('alertHistoryList');

        // Active alerts
        if (alerts.length === 0) {
            activeList.innerHTML = '<div class="alert-empty">No active alerts</div>';
        } else {
            activeList.innerHTML = alerts.map(a => `
                <div class="alert-item" data-alert-id="${a.id}">
                    <span class="alert-dot" style="background:${a.color}"></span>
                    <span class="alert-item-price">${ChartEngine.fmt(a.price)}</span>
                    <button class="alert-toggle ${a.visible ? '' : 'off'}" data-id="${a.id}" title="${a.visible ? 'Hide line' : 'Show line'}">${a.visible ? '👁' : '👁‍🗨'}</button>
                    <button class="alert-edit" data-id="${a.id}" title="Edit">✏️</button>
                    <button class="alert-delete" data-id="${a.id}">✕</button>
                </div>
            `).join('');

            activeList.querySelectorAll('.alert-toggle').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleAlertVisibility(parseInt(btn.dataset.id));
                });
            });
            activeList.querySelectorAll('.alert-edit').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    startEditAlert(parseInt(btn.dataset.id));
                });
            });
            activeList.querySelectorAll('.alert-delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeAlert(parseInt(btn.dataset.id));
                });
            });
        }

        // History
        if (alertHistory.length === 0) {
            historyList.innerHTML = '<div class="alert-empty">No alerts triggered yet</div>';
        } else {
            historyList.innerHTML = alertHistory.map(h => `
                <div class="alert-history-item">
                    <span class="alert-dot" style="background:${h.color}"></span>
                    <span class="ah-price">${ChartEngine.fmt(h.price)}</span>
                    <span class="ah-time">${h.time}</span>
                </div>
            `).join('');
        }
    }

    function checkAlerts(currentPrice) {
        if (!currentPrice || alerts.length === 0) return;

        const toTrigger = [];
        alerts = alerts.filter(a => {
            if (!a.visible) return true;
            const crossed = (lastRawPrice && (
                (lastRawPrice <= a.price && currentPrice >= a.price) ||
                (lastRawPrice >= a.price && currentPrice <= a.price)
            )) || Math.abs(currentPrice - a.price) / a.price < 0.001;

            if (crossed) {
                toTrigger.push(a);
                return false;
            }
            return true;
        });

        for (const a of toTrigger) {
            ChartEngine.removeAlertLine(a.id);
            const now = new Date();
            const timeStr = now.toLocaleString('en-GB', {
                timeZone: 'Europe/Berlin',
                day: '2-digit', month: 'short',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
            });
            alertHistory.unshift({ price: a.price, color: a.color, time: timeStr });

            const soundEnabled = document.getElementById('alertSoundEnabled').checked;
            if (soundEnabled) {
                const repeatEnabled = document.getElementById('alertRepeatSound').checked;
                playAlertSound();
                if (repeatEnabled) {
                    let count = 0;
                    if (repeatInterval) clearInterval(repeatInterval);
                    repeatInterval = setInterval(() => {
                        count++;
                        if (count >= 3) { clearInterval(repeatInterval); repeatInterval = null; return; }
                        playAlertSound();
                    }, 1500);
                }
            }
        }

        if (toTrigger.length > 0) {
            updateAlertBadge();
            renderAlerts();
            saveAlertsToStorage();
        }
    }

    function playAlertSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const volSlider = document.getElementById('alertVolume');
            const volume = (volSlider ? parseInt(volSlider.value) : 50) / 100;
            const soundType = document.getElementById('alertSoundType')?.value || 'beep';

            if (soundType === 'beep') {
                [0, 0.2].forEach(delay => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain); gain.connect(ctx.destination);
                    osc.frequency.value = 880; osc.type = 'sine';
                    gain.gain.setValueAtTime(volume * 0.5, ctx.currentTime + delay);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.15);
                    osc.start(ctx.currentTime + delay);
                    osc.stop(ctx.currentTime + delay + 0.15);
                });
            } else if (soundType === 'chime') {
                [0, 0.12, 0.24].forEach((delay, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain); gain.connect(ctx.destination);
                    osc.frequency.value = [1200, 900, 600][i]; osc.type = 'sine';
                    gain.gain.setValueAtTime(volume * 0.4, ctx.currentTime + delay);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.2);
                    osc.start(ctx.currentTime + delay);
                    osc.stop(ctx.currentTime + delay + 0.25);
                });
            } else if (soundType === 'ping') {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.frequency.value = 1400; osc.type = 'triangle';
                gain.gain.setValueAtTime(volume * 0.6, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.35);
            }
        } catch (e) {
            console.warn('Could not play alert sound:', e);
        }
    }

    function saveAlertsToStorage() {
        try {
            localStorage.setItem('tradeAlerts', JSON.stringify(alerts));
            localStorage.setItem('tradeAlertHistory', JSON.stringify(alertHistory));
        } catch (e) { }
    }

    function loadAlertsFromStorage() {
        try {
            const saved = localStorage.getItem('tradeAlerts');
            const hist = localStorage.getItem('tradeAlertHistory');
            if (saved) {
                alerts = JSON.parse(saved);
                alertIdCounter = alerts.reduce((m, a) => Math.max(m, a.id), 0);
                // Re-draw lines
                alerts.forEach(a => {
                    if (a.visible) ChartEngine.addAlertLine(a.id, a.price, a.color);
                });
            }
            if (hist) alertHistory = JSON.parse(hist);
            updateAlertBadge();
            renderAlerts();
        } catch (e) { }
    }

    // ─── Trade Journal System ────────────────────────────
    let trades = [];  // { id, ticker, buyPrice, sellPrice, qty }
    let tradeIdCounter = 0;
    let editingTradeId = null;

    function setupTradeJournal() {
        const btn = document.getElementById('tradeJournalBtn');
        const panel = document.getElementById('tradePanel');
        const addBtn = document.getElementById('addTradeBtn');
        const cancelBtn = document.getElementById('cancelEditTradeBtn');

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('open');
            document.getElementById('alertPanel')?.classList.remove('open');
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.trade-journal-wrap')) {
                panel.classList.remove('open');
            }
        });

        addBtn.addEventListener('click', () => {
            const ticker = document.getElementById('tradeTicker').value.trim().toUpperCase();
            const buyPrice = parseFloat(document.getElementById('tradeBuyPrice').value);
            const sellPrice = parseFloat(document.getElementById('tradeSellPrice').value);
            const qty = parseFloat(document.getElementById('tradeQty').value);

            if (!ticker || isNaN(buyPrice) || isNaN(sellPrice) || isNaN(qty) || qty <= 0) return;

            if (editingTradeId !== null) {
                const t = trades.find(x => x.id === editingTradeId);
                if (t) {
                    t.ticker = ticker; t.buyPrice = buyPrice;
                    t.sellPrice = sellPrice; t.qty = qty;
                }
                editingTradeId = null;
                addBtn.textContent = '+ Add Trade';
                cancelBtn.style.display = 'none';
            } else {
                trades.push({ id: ++tradeIdCounter, ticker, buyPrice, sellPrice, qty });
            }

            clearTradeForm();
            renderTrades();
            saveTradesToStorage();
        });

        cancelBtn.addEventListener('click', () => {
            editingTradeId = null;
            addBtn.textContent = '+ Add Trade';
            cancelBtn.style.display = 'none';
            clearTradeForm();
        });

        loadTradesFromStorage();
    }

    function clearTradeForm() {
        document.getElementById('tradeTicker').value = '';
        document.getElementById('tradeBuyPrice').value = '';
        document.getElementById('tradeSellPrice').value = '';
        document.getElementById('tradeQty').value = '';
    }

    function startEditTrade(id) {
        const t = trades.find(x => x.id === id);
        if (!t) return;
        document.getElementById('tradeTicker').value = t.ticker;
        document.getElementById('tradeBuyPrice').value = t.buyPrice;
        document.getElementById('tradeSellPrice').value = t.sellPrice;
        document.getElementById('tradeQty').value = t.qty;
        document.getElementById('addTradeBtn').textContent = '✓ Save';
        document.getElementById('cancelEditTradeBtn').style.display = '';
        editingTradeId = id;
    }

    function removeTrade(id) {
        trades = trades.filter(t => t.id !== id);
        renderTrades();
        saveTradesToStorage();
    }

    function renderTrades() {
        const list = document.getElementById('tradeList');
        const totalEl = document.getElementById('tradeTotal');

        if (trades.length === 0) {
            list.innerHTML = '<div class="alert-empty">No trades recorded</div>';
            totalEl.innerHTML = '';
            totalEl.className = 'trade-total';
            return;
        }

        let totalPL = 0;
        list.innerHTML = trades.map(t => {
            const pl = (t.sellPrice - t.buyPrice) * t.qty;
            totalPL += pl;
            const plClass = pl >= 0 ? 'profit' : 'loss';
            const plSign = pl >= 0 ? '+' : '';
            return `
                <div class="trade-item">
                    <span class="trade-item-ticker">${t.ticker}</span>
                    <span class="trade-item-detail">
                        <span>Buy: ${t.buyPrice.toLocaleString()}</span>
                        <span>Sell: ${t.sellPrice.toLocaleString()}</span>
                    </span>
                    <span class="trade-item-detail">
                        <span>Qty: ${t.qty}</span>
                    </span>
                    <span class="trade-item-pl ${plClass}">${plSign}${pl.toFixed(2)}</span>
                    <span class="trade-item-actions">
                        <button data-id="${t.id}" class="trade-edit-btn" title="Edit">✏️</button>
                        <button data-id="${t.id}" class="trade-del-btn" title="Delete">✕</button>
                    </span>
                </div>`;
        }).join('');

        // Wire up buttons
        list.querySelectorAll('.trade-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                startEditTrade(parseInt(btn.dataset.id));
            });
        });
        list.querySelectorAll('.trade-del-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeTrade(parseInt(btn.dataset.id));
            });
        });

        // Total P/L
        const plSign = totalPL >= 0 ? '+' : '';
        totalEl.textContent = `Total P/L: ${plSign}${totalPL.toFixed(2)}`;
        totalEl.className = 'trade-total ' + (totalPL >= 0 ? 'profit' : 'loss');
    }

    function saveTradesToStorage() {
        try { localStorage.setItem('tradeJournal', JSON.stringify(trades)); } catch (e) { }
    }

    function loadTradesFromStorage() {
        try {
            const saved = localStorage.getItem('tradeJournal');
            if (saved) {
                trades = JSON.parse(saved);
                tradeIdCounter = trades.reduce((m, t) => Math.max(m, t.id), 0);
            }
            renderTrades();
        } catch (e) { }
    }
})();
