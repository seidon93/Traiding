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
        if (document.getElementById('rangeModeOC')?.classList.contains('active')) return 'oc';
        return 'percent';
    }

    function setRangeMode(mode) {
        document.getElementById('rangeModePercent').classList.toggle('active', mode === 'percent');
        document.getElementById('rangeModePrice').classList.toggle('active', mode === 'price');
        document.getElementById('rangeModeHL').classList.toggle('active', mode === 'hl');
        document.getElementById('rangeModeOC').classList.toggle('active', mode === 'oc');
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
            } else if (mode === 'oc') {
                const diff = r.close - r.open;
                const sign = diff >= 0 ? '+' : '';
                displayVal = `${sign}${diff.toFixed(2)}`;
            } else {
                displayVal = `${(((r.high - r.low) / r.low) * 100).toFixed(2)}%`;
            }
            const wideVal = (mode === 'hl') ? ' style="min-width:120px;text-align:right"' : '';
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

        // Session range area toggles
        const handleLondonRange = () => {
            const enabled = document.getElementById('londonRange').checked;
            if (enabled) {
                const color = document.getElementById('londonRangeColor').value;
                ChartEngine.addSessionRange(ChartEngine.getData(), 'london', color);
            } else {
                ChartEngine.clearSessionRange('london');
            }
        };
        document.getElementById('londonRange').addEventListener('change', handleLondonRange);
        document.getElementById('londonRangeColor').addEventListener('change', handleLondonRange);

        const handleUSRange = () => {
            const enabled = document.getElementById('usRange').checked;
            if (enabled) {
                const color = document.getElementById('usRangeColor').value;
                ChartEngine.addSessionRange(ChartEngine.getData(), 'us', color);
            } else {
                ChartEngine.clearSessionRange('us');
            }
        };
        document.getElementById('usRange').addEventListener('change', handleUSRange);
        document.getElementById('usRangeColor').addEventListener('change', handleUSRange);

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

        // Volume is off by default (checkbox unchecked)

        // Daily Range mode toggle (% / $ / H/L / O/C)
        document.getElementById('rangeModePercent').addEventListener('click', () => setRangeMode('percent'));
        document.getElementById('rangeModePrice').addEventListener('click', () => setRangeMode('price'));
        document.getElementById('rangeModeHL').addEventListener('click', () => setRangeMode('hl'));
        document.getElementById('rangeModeOC').addEventListener('click', () => setRangeMode('oc'));

        // Daily Range chart overlay
        const rangeChartToggle = document.getElementById('rangeChartEnabled');
        const rangeChartDays = document.getElementById('rangeChartDays');
        const rangeChartColor = document.getElementById('rangeChartColor');
        const rangeChartLineStyle = document.getElementById('rangeChartLineStyle');
        const rangeChartLineWidth = document.getElementById('rangeChartLineWidth');

        const handleRangeChart = () => {
            if (rangeChartToggle.checked && cachedRanges) {
                const days = parseInt(rangeChartDays.value) || 5;
                const lw = parseInt(rangeChartLineWidth.value) || 2;
                const ls = parseInt(rangeChartLineStyle.value);
                ChartEngine.addDailyRangeOverlay(cachedRanges, days, rangeChartColor.value, lw, ls);
            } else {
                ChartEngine.clearDailyRangeOverlay();
            }
        };

        rangeChartToggle.addEventListener('change', handleRangeChart);
        rangeChartDays.addEventListener('change', handleRangeChart);
        rangeChartColor.addEventListener('change', handleRangeChart);
        rangeChartLineStyle.addEventListener('change', handleRangeChart);
        rangeChartLineWidth.addEventListener('change', handleRangeChart);

        // ─── Prediction panel ────────────────────────────────
        initPredictionEvents();
    }

    // ─── Prediction ──────────────────────────────────────────
    let predictionData = null;  // cached API response
    let activePredTab = 'short'; // 'short' or 'long'

    function initPredictionEvents() {
        const calcBtn = document.getElementById('calcPrediction');
        const slSlider = document.getElementById('predSLMultiplier');
        const slValLabel = document.getElementById('predSLValue');
        const showOnChart = document.getElementById('predShowOnChart');

        // Tab switching
        document.querySelectorAll('.pred-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.pred-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                activePredTab = tab.dataset.predTab;
                if (predictionData) renderPrediction();
            });
        });

        // Calculate button
        calcBtn.addEventListener('click', async () => {
            const symbol = document.getElementById('tickerSymbol').textContent;
            calcBtn.disabled = true;
            calcBtn.textContent = '⏳ Calculating...';
            document.getElementById('predictionContent').innerHTML =
                '<div class="trend-loading">Analyzing 6 timeframes...</div>';

            try {
                predictionData = await DataService.getPrediction(symbol);
                renderPrediction();
            } catch (e) {
                document.getElementById('predictionContent').innerHTML =
                    '<div class="trend-loading" style="color:var(--candle-down)">Failed to calculate</div>';
                console.error('Prediction error:', e);
            } finally {
                calcBtn.disabled = false;
                calcBtn.textContent = '⚡ Calculate';
            }
        });

        // SL multiplier slider
        slSlider.addEventListener('input', () => {
            const val = parseFloat(slSlider.value);
            slValLabel.textContent = `${val.toFixed(1)}×`;
            if (predictionData) renderPrediction();
        });

        // Show on chart toggle
        showOnChart.addEventListener('change', () => {
            if (showOnChart.checked && predictionData) {
                drawCurrentPredOnChart();
            } else {
                ChartEngine.clearPredictionLines();
            }
        });
    }

    function renderPrediction() {
        if (!predictionData) return;

        const slMult = parseFloat(document.getElementById('predSLMultiplier').value) || 1;
        const pred = activePredTab === 'short' ? predictionData.shortTerm : predictionData.longTerm;
        const content = document.getElementById('predictionContent');

        if (!pred) {
            content.innerHTML = '<div class="trend-loading" style="color:var(--text-muted)">No data for this mode</div>';
            return;
        }

        const price = predictionData.currentPrice;
        const fmt = ChartEngine.fmt;

        // Recalculate SL with slider multiplier
        const longSL = price - pred.avgATR * slMult;
        const shortSL = price + pred.avgATR * slMult;
        const longRR = pred.long.rr * (1 / slMult);
        const shortRR = pred.short.rr * (1 / slMult);

        // Confidence bar color
        const confColor = pred.confidence >= 80 ? 'var(--candle-up)' :
            pred.confidence >= 50 ? 'var(--accent-warning)' : 'var(--candle-down)';

        let html = '';

        // Consensus + Confidence
        html += `<div class="pred-consensus">
            <span>Consensus: <span class="consensus-label ${pred.consensus}">${pred.consensus === 'bull' ? '▲ BULL' : pred.consensus === 'bear' ? '▼ BEAR' : '— NEUTRAL'}</span></span>
            <div style="display:flex;align-items:center;gap:6px">
                <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${pred.confidence}%</span>
                <div class="confidence-bar">
                    <div class="confidence-fill" style="width:${pred.confidence}%;background:${confColor}"></div>
                </div>
            </div>
        </div>`;

        // TF breakdown chips
        html += '<div class="pred-tf-breakdown">';
        for (const tf of pred.timeframes) {
            html += `<span class="pred-tf-chip ${tf.trend}">${tf.label} ${tf.trend === 'bull' ? '▲' : '▼'}</span>`;
        }
        html += '</div>';

        // ATR info
        html += `<div style="font-size:10px;color:var(--text-muted);margin-bottom:8px;font-family:var(--font-mono)">
            ATR: ${fmt(pred.avgATR)} · Strength: ${pred.avgStrength}%
        </div>`;

        // Long prediction card
        html += `<div class="pred-direction">
            <div class="pred-direction-header long">
                <span>▲ Long</span>
                <span class="rr-badge">R:R ${longRR.toFixed(1)}</span>
            </div>
            <div class="pred-row"><span class="pred-label">Entry</span><span class="pred-value entry">${fmt(pred.long.entry)}</span></div>
            <div class="pred-row"><span class="pred-label">Target</span><span class="pred-value target">${fmt(pred.long.target)}</span></div>
            <div class="pred-row"><span class="pred-label">Stop Loss</span><span class="pred-value sl">${fmt(longSL)}</span></div>
        </div>`;

        // Short prediction card
        html += `<div class="pred-direction">
            <div class="pred-direction-header short">
                <span>▼ Short</span>
                <span class="rr-badge">R:R ${shortRR.toFixed(1)}</span>
            </div>
            <div class="pred-row"><span class="pred-label">Entry</span><span class="pred-value entry">${fmt(pred.short.entry)}</span></div>
            <div class="pred-row"><span class="pred-label">Target</span><span class="pred-value target-short">${fmt(pred.short.target)}</span></div>
            <div class="pred-row"><span class="pred-label">Stop Loss</span><span class="pred-value sl-short">${fmt(shortSL)}</span></div>
        </div>`;

        // Support / Resistance
        if (pred.support || pred.resistance) {
            html += '<div class="pred-sr">';
            if (pred.support) html += `<span><span class="sr-label">Support</span><span class="sr-val" style="color:var(--candle-up)">${fmt(pred.support)}</span></span>`;
            if (pred.resistance) html += `<span><span class="sr-label">Resistance</span><span class="sr-val" style="color:var(--candle-down)">${fmt(pred.resistance)}</span></span>`;
            html += '</div>';
        }

        content.innerHTML = html;

        // Update chart if show on chart is enabled
        if (document.getElementById('predShowOnChart').checked) {
            drawCurrentPredOnChart();
        }
    }

    function drawCurrentPredOnChart() {
        if (!predictionData) return;

        const slMult = parseFloat(document.getElementById('predSLMultiplier').value) || 1;
        const pred = activePredTab === 'short' ? predictionData.shortTerm : predictionData.longTerm;
        if (!pred) return;

        const price = predictionData.currentPrice;

        // Draw the consensus direction (show the recommended direction)
        if (pred.consensus === 'bull' || pred.consensus === 'neutral') {
            const longSL = price - pred.avgATR * slMult;
            ChartEngine.drawPredictionLines(pred.long.entry, pred.long.target, longSL, 'long');
        } else {
            const shortSL = price + pred.avgATR * slMult;
            ChartEngine.drawPredictionLines(pred.short.entry, pred.short.target, shortSL, 'short');
        }
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
