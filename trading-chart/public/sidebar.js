/* ═══════════════════════════════════════════════════════════════
   SIDEBAR.JS — Left and right sidebar management
   ═══════════════════════════════════════════════════════════════ */

const Sidebar = (() => {

    // ─── Trend Panel ──────────────────────────────────────
    async function updateTrend(symbol) {
        const panel = document.getElementById('trendPanel');
        panel.innerHTML = '<div class="trend-loading">Loading trends…</div>';

        try {
            const trends = await DataService.getTrend(symbol);
            const tfLabels = { '1h': '1H', '4h': '4H', '1d': 'D', '1wk': 'W', '1mo': 'M' };

            let html = '';
            for (const [tf, label] of Object.entries(tfLabels)) {
                const t = trends[tf];
                if (!t) {
                    html += `<div class="trend-item">
            <span class="tf-label">${label}</span>
            <span class="trend-badge" style="color:var(--text-muted)">N/A</span>
            <span class="trend-pct" style="color:var(--text-muted)">—</span>
          </div>`;
                    continue;
                }
                const isBull = t.trend === 'bull';
                const cls = isBull ? 'bull' : 'bear';
                const icon = isBull ? '▲' : '▼';
                const sign = t.changePercent >= 0 ? '+' : '';
                html += `<div class="trend-item">
          <span class="tf-label">${label}</span>
          <span class="trend-badge ${cls}">${icon} ${t.trend.toUpperCase()}</span>
          <span class="trend-pct" style="color:${isBull ? 'var(--candle-up)' : 'var(--candle-down)'}">${sign}${t.changePercent}%</span>
        </div>`;
            }
            panel.innerHTML = html;
        } catch (e) {
            panel.innerHTML = '<div class="trend-loading">Failed to load trends</div>';
        }
    }

    // ─── Monday Range ─────────────────────────────────────
    async function updateMondayRange(symbol) {
        const content = document.getElementById('mondayRangeContent');
        content.innerHTML = '<div class="trend-loading">Loading…</div>';

        if (DataService.isCrypto(symbol)) {
            content.innerHTML = '<div class="trend-loading" style="color:var(--text-muted)">N/A for crypto</div>';
            ChartEngine.clearMondayRange();
            return;
        }

        try {
            const data = await DataService.getMondayRange(symbol);
            if (!data.latest) {
                content.innerHTML = '<div class="trend-loading">No Monday data</div>';
                return;
            }

            const m = data.latest;
            const dateStr = new Date(m.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            content.innerHTML = `
        <div class="monday-info">
          <div class="monday-row" style="font-size:11px;color:var(--text-muted);background:none;padding:2px 8px;">
            ${dateStr}
          </div>
          <div class="monday-row high">
            <span class="label">High</span>
            <span class="value">${ChartEngine.fmt(m.high)}</span>
          </div>
          <div class="monday-row low">
            <span class="label">Low</span>
            <span class="value">${ChartEngine.fmt(m.low)}</span>
          </div>
          <div class="monday-row mid">
            <span class="label">Mid</span>
            <span class="value">${ChartEngine.fmt(m.mid)}</span>
          </div>
        </div>
      `;

            // Draw on chart if enabled
            const enabled = document.getElementById('mondayRangeEnabled');
            if (enabled && enabled.checked) {
                ChartEngine.setMondayRange(m.high, m.low, m.mid);
            }
        } catch (e) {
            content.innerHTML = '<div class="trend-loading">Failed to load</div>';
        }
    }

    // ─── Daily Ranges ─────────────────────────────────────
    let cachedRanges = null;

    async function updateDailyRanges(symbol) {
        const content = document.getElementById('dailyRangesContent');
        content.innerHTML = '<div class="trend-loading">Loading…</div>';

        try {
            const ranges = await DataService.getDailyRanges(symbol);
            if (!ranges || ranges.length === 0) {
                content.innerHTML = '<div class="trend-loading">No data</div>';
                cachedRanges = null;
                return;
            }
            cachedRanges = ranges;
            renderDailyRanges();
        } catch (e) {
            content.innerHTML = '<div class="trend-loading">Failed to load</div>';
            cachedRanges = null;
        }
    }

    function getActiveRangeMode() {
        if (document.getElementById('rangeModePrice')?.classList.contains('active')) return 'price';
        if (document.getElementById('rangeModeHL')?.classList.contains('active')) return 'hl';
        return 'percent';
    }

    function setRangeMode(mode) {
        document.getElementById('rangeModePercent').classList.toggle('active', mode === 'percent');
        document.getElementById('rangeModePrice').classList.toggle('active', mode === 'price');
        document.getElementById('rangeModeHL').classList.toggle('active', mode === 'hl');
        renderDailyRanges();
    }

    function renderDailyRanges() {
        if (!cachedRanges) return;
        const content = document.getElementById('dailyRangesContent');
        const mode = getActiveRangeMode();

        const maxRange = Math.max(...cachedRanges.map(r => r.range));
        const last15 = cachedRanges.slice(-15).reverse();

        let html = '';
        for (const r of last15) {
            const dateStr = new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            const barPct = (r.range / maxRange * 100).toFixed(0);
            let displayVal;
            if (mode === 'price') {
                displayVal = ChartEngine.fmt(r.high - r.low);
            } else if (mode === 'hl') {
                displayVal = `${ChartEngine.fmt(r.high)} – ${ChartEngine.fmt(r.low)}`;
            } else {
                displayVal = `${(((r.high - r.low) / r.low) * 100).toFixed(2)}%`;
            }
            const wideVal = mode === 'hl' ? ' style="min-width:120px;text-align:right"' : '';
            html += `<div class="range-item${mode === 'hl' ? ' range-item-wide' : ''}">
          <span class="range-date">${dateStr}</span>
          <div class="range-bar-container">
            <div class="range-bar" style="width:${barPct}%"></div>
          </div>
          <span class="range-val"${wideVal}>${displayVal}</span>
        </div>`;
        }
        content.innerHTML = html;
    }

    // ─── Stop Loss Logic ──────────────────────────────────
    function updateSL(currentPrice) {
        const riskInput = document.getElementById('riskPercent');
        const entryInput = document.getElementById('entryPrice');
        const slPriceEl = document.getElementById('slPrice');
        const slDistanceEl = document.getElementById('slDistance');
        const slEnabled = document.getElementById('slEnabled');

        const risk = parseFloat(riskInput.value) || 2;
        const entry = parseFloat(entryInput.value) || currentPrice;

        if (!entry) {
            slPriceEl.textContent = '—';
            slDistanceEl.textContent = '—';
            ChartEngine.removeSLLine();
            return;
        }

        const slPrice = entry * (1 - risk / 100);
        const distance = entry - slPrice;

        slPriceEl.textContent = ChartEngine.fmt(slPrice);
        slDistanceEl.textContent = ChartEngine.fmt(distance);

        if (slEnabled && slEnabled.checked) {
            ChartEngine.setSLPriceLine(slPrice);
        } else {
            ChartEngine.removeSLLine();
        }
    }

    // ─── Initialize Sidebar Events ────────────────────────
    function initEvents() {
        // Toggle sidebars
        document.getElementById('toggleLeftSidebar').addEventListener('click', () => {
            const sidebar = document.getElementById('leftSidebar');
            sidebar.classList.toggle('open');
            document.getElementById('toggleLeftSidebar').classList.toggle('active');
            setTimeout(() => ChartEngine.resize(), 300);
        });

        document.getElementById('toggleRightSidebar').addEventListener('click', () => {
            const sidebar = document.getElementById('rightSidebar');
            sidebar.classList.toggle('open');
            document.getElementById('toggleRightSidebar').classList.toggle('active');
            setTimeout(() => ChartEngine.resize(), 300);
        });

        // Set initial button states
        document.getElementById('toggleLeftSidebar').classList.add('active');
        document.getElementById('toggleRightSidebar').classList.add('active');

        // SL controls
        document.getElementById('riskPercent').addEventListener('input', () => {
            const price = parseFloat(document.getElementById('tickerPrice').textContent.replace(/,/g, ''));
            updateSL(price);
        });
        document.getElementById('entryPrice').addEventListener('input', () => {
            const price = parseFloat(document.getElementById('tickerPrice').textContent.replace(/,/g, ''));
            updateSL(price);
        });
        document.getElementById('slEnabled').addEventListener('change', () => {
            const price = parseFloat(document.getElementById('tickerPrice').textContent.replace(/,/g, ''));
            updateSL(price);
        });

        // Monday range toggle
        document.getElementById('mondayRangeEnabled').addEventListener('change', (e) => {
            if (e.target.checked) {
                // Re-fetch
                const symbol = document.getElementById('tickerSymbol').textContent;
                updateMondayRange(symbol);
            } else {
                ChartEngine.clearMondayRange();
            }
        });

        // Session toggles
        document.getElementById('londonSession').addEventListener('change', (e) => {
            if (e.target.checked) {
                ChartEngine.addSessionMarkers(ChartEngine.getData(), 'london');
            } else {
                ChartEngine.clearSessionMarkers('london');
            }
        });

        document.getElementById('usSession').addEventListener('change', (e) => {
            if (e.target.checked) {
                ChartEngine.addSessionMarkers(ChartEngine.getData(), 'us');
            } else {
                ChartEngine.clearSessionMarkers('us');
            }
        });

        // Indicator toggles
        document.querySelectorAll('.ind-toggle').forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const name = e.target.dataset.indicator;
                if (e.target.checked) {
                    const params = ChartEngine.getIndicatorParams(name);
                    ChartEngine.addIndicator(name, params);
                } else {
                    ChartEngine.removeIndicator(name);
                }
            });
        });

        // Indicator parameter changes
        document.querySelectorAll('.ind-input, .ind-color').forEach(el => {
            el.addEventListener('change', () => {
                const paramName = el.dataset.param;
                if (!paramName) return;
                const indName = paramName.split('-')[0];
                const toggle = document.querySelector(`[data-indicator="${indName}"]`);
                if (toggle && toggle.checked) {
                    const params = ChartEngine.getIndicatorParams(indName);
                    ChartEngine.addIndicator(indName, params);
                }
            });
        });

        // MTF overlay toggles and changes
        for (let i = 1; i <= 3; i++) {
            const toggle = document.getElementById(`mtf${i}Enabled`);
            const select = document.getElementById(`mtf${i}Select`);
            const upColor = document.getElementById(`mtf${i}UpColor`);
            const downColor = document.getElementById(`mtf${i}DownColor`);

            const handleMTFChange = () => {
                if (toggle.checked) {
                    loadMTFOverlay(i, select.value, upColor.value, downColor.value);
                } else {
                    ChartEngine.removeMTFOverlay(i);
                }
            };

            toggle.addEventListener('change', handleMTFChange);
            select.addEventListener('change', handleMTFChange);
            upColor.addEventListener('change', handleMTFChange);
            downColor.addEventListener('change', handleMTFChange);
        }

        // Enable volume by default
        const volToggle = document.querySelector('[data-indicator="volume"]');
        if (volToggle && volToggle.checked) {
            ChartEngine.addIndicator('volume');
        }

        // Daily Range mode toggle (% / $ / H/L)
        document.getElementById('rangeModePercent').addEventListener('click', () => setRangeMode('percent'));
        document.getElementById('rangeModePrice').addEventListener('click', () => setRangeMode('price'));
        document.getElementById('rangeModeHL').addEventListener('click', () => setRangeMode('hl'));
    }

    async function loadMTFOverlay(index, timeframe, upColor, downColor) {
        const symbol = document.getElementById('tickerSymbol').textContent;
        try {
            const data = await DataService.getCandles(symbol, timeframe, 500);
            if (data && data.candles) {
                ChartEngine.addMTFOverlay(index, data.candles, upColor, downColor);
            }
        } catch (e) {
            console.error(`MTF overlay ${index} error:`, e);
        }
    }

    return { updateTrend, updateMondayRange, updateDailyRanges, updateSL, initEvents, loadMTFOverlay };
})();
