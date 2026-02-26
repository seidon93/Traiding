/* ═══════════════════════════════════════════════════════════════
   CHART.JS — TradingView Lightweight Charts engine
   ═══════════════════════════════════════════════════════════════ */

const ChartEngine = (() => {
    let chart = null;
    let mainSeries = null;
    let volumeSeries = null;
    let currentPriceLine = null;
    let slPriceLine = null;
    let candleData = [];
    let rawCandleData = [];      // original unscaled candle data
    let isPercentMode = false;
    let activeCurrency = null;   // null = native, else {code,rate}

    // Indicator series references
    const indicatorSeries = {};
    // Multi-timeframe overlay series
    const mtfSeries = {};
    // Monday range lines
    const mondayLines = [];
    // Session markers
    const sessionMarkers = [];

    function init() {
        const container = document.getElementById('chart');
        chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: container.clientHeight,
            layout: {
                background: { type: 'solid', color: '#0a0e17' },
                textColor: '#94a3b8',
                fontFamily: "'Inter', sans-serif",
                fontSize: 11
            },
            grid: {
                vertLines: { color: 'rgba(99, 115, 148, 0.08)' },
                horzLines: { color: 'rgba(99, 115, 148, 0.08)' }
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: {
                    width: 1,
                    color: 'rgba(0, 212, 170, 0.3)',
                    style: LightweightCharts.LineStyle.Dashed,
                    labelBackgroundColor: '#00d4aa'
                },
                horzLine: {
                    width: 1,
                    color: 'rgba(0, 212, 170, 0.3)',
                    style: LightweightCharts.LineStyle.Dashed,
                    labelBackgroundColor: '#00d4aa'
                }
            },
            rightPriceScale: {
                borderColor: 'rgba(99, 115, 148, 0.2)',
                scaleMargins: { top: 0.05, bottom: 0.15 }
            },
            timeScale: {
                borderColor: 'rgba(99, 115, 148, 0.2)',
                timeVisible: true,
                secondsVisible: false,
                rightOffset: 30,
                barSpacing: 8,
                minBarSpacing: 2
            },
            localization: {
                priceFormatter: price => {
                    if (price == null) return '—';
                    const abs = Math.abs(price);
                    let decimals = abs >= 1000 ? 2 : abs >= 1 ? 2 : 6;
                    const parts = price.toFixed(decimals).split('.');
                    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
                    return parts.join('.');
                }
            },
            handleScroll: { vertTouchDrag: true },
            handleScale: { axisPressedMouseMove: true }
        });

        // Main candlestick series
        mainSeries = chart.addCandlestickSeries({
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderUpColor: '#26a69a',
            borderDownColor: '#ef5350',
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
            lastValueVisible: false,
            priceLineVisible: false
        });

        // Volume series (hidden by default)
        volumeSeries = chart.addHistogramSeries({
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
            visible: false
        });

        chart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.85, bottom: 0 }
        });

        // Crosshair info
        chart.subscribeCrosshairMove(handleCrosshairMove);

        // Resize handler
        const resizeObserver = new ResizeObserver(() => {
            if (chart && container.clientWidth > 0 && container.clientHeight > 0) {
                chart.resize(container.clientWidth, container.clientHeight);
            }
        });
        resizeObserver.observe(container);

        // Scroll-to-current button
        const scrollBtn = document.getElementById('scrollToCurrent');
        chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
            if (!range || candleData.length === 0) return;
            // Show button when the last candle is not visible (scrolled back)
            const lastIndex = candleData.length - 1;
            const isAtEnd = range.to >= lastIndex - 2;
            scrollBtn.classList.toggle('visible', !isAtEnd);
        });

        scrollBtn.addEventListener('click', () => {
            chart.timeScale().scrollToRealTime();
        });
    }

    function handleCrosshairMove(param) {
        const infoEl = document.getElementById('crosshairInfo');
        if (!param.time || !param.seriesData || param.seriesData.size === 0) {
            infoEl.classList.remove('visible');
            return;
        }

        const data = param.seriesData.get(mainSeries);
        if (!data) return;

        const d = new Date(data.time * 1000);
        const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const change = data.close - data.open;
        const changePct = ((change / data.open) * 100).toFixed(2);
        const color = change >= 0 ? '#26a69a' : '#ef5350';

        infoEl.innerHTML = `
      <span style="color:var(--text-muted)">${dateStr} ${timeStr}</span> &nbsp;
      O <span style="color:${color}">${fmt(data.open)}</span> &nbsp;
      H <span style="color:${color}">${fmt(data.high)}</span> &nbsp;
      L <span style="color:${color}">${fmt(data.low)}</span> &nbsp;
      C <span style="color:${color}">${fmt(data.close)}</span> &nbsp;
      <span style="color:${color}">${change >= 0 ? '+' : ''}${changePct}%</span>
    `;
        infoEl.classList.add('visible');
    }

    function fmt(num) {
        if (num == null) return '—';
        let decimals;
        if (Math.abs(num) >= 1000) decimals = 2;
        else if (Math.abs(num) >= 1) decimals = 2;
        else decimals = 6;
        const parts = num.toFixed(decimals).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return parts.join('.');
    }

    function setData(candles) {
        rawCandleData = candles;
        candleData = activeCurrency ? scaleCandles(candles, activeCurrency.rate) : candles;
        mainSeries.setData(candleData);

        // Volume
        const volData = Indicators.volume(candles);
        volumeSeries.setData(volData);

        // Show last ~150 candles so chart looks zoomed‑in on load
        const visibleBars = 150;
        if (candles.length > visibleBars) {
            chart.timeScale().setVisibleLogicalRange({
                from: candles.length - visibleBars,
                to: candles.length + 30 // right offset room
            });
        } else {
            chart.timeScale().fitContent();
        }

        // Update all active indicators
        updateAllIndicators();
    }

    function getData() {
        return candleData;
    }

    // ─── Current Price Line ────────────────────────────────
    function setCurrentPriceLine(price) {
        if (currentPriceLine) {
            mainSeries.removePriceLine(currentPriceLine);
        }
        currentPriceLine = mainSeries.createPriceLine({
            price: price,
            color: '#00d4aa',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'Current',
            lineVisible: true
        });
    }

    // ─── Stop Loss Line ───────────────────────────────────
    function setSLPriceLine(price) {
        if (slPriceLine) {
            mainSeries.removePriceLine(slPriceLine);
            slPriceLine = null;
        }
        if (price != null) {
            slPriceLine = mainSeries.createPriceLine({
                price: price,
                color: '#ef5350',
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle.Dashed,
                axisLabelVisible: true,
                title: 'SL',
                lineVisible: true
            });
        }
    }

    function removeSLLine() {
        if (slPriceLine) {
            mainSeries.removePriceLine(slPriceLine);
            slPriceLine = null;
        }
    }

    // ─── Monday Range Lines ────────────────────────────────
    function setMondayRange(high, low, mid) {
        clearMondayRange();
        const lines = [
            { price: high, color: '#26a69a', title: 'Mon Hi' },
            { price: low, color: '#ef5350', title: 'Mon Lo' },
            { price: mid, color: '#f5a623', title: 'Mon Mid' }
        ];
        for (const l of lines) {
            const line = mainSeries.createPriceLine({
                price: l.price,
                color: l.color,
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle.Dotted,
                axisLabelVisible: true,
                title: l.title,
                lineVisible: true
            });
            mondayLines.push(line);
        }
    }

    function clearMondayRange() {
        for (const line of mondayLines) {
            try { mainSeries.removePriceLine(line); } catch (e) { }
        }
        mondayLines.length = 0;
    }

    // ─── Session Markers ──────────────────────────────────
    function addSessionMarkers(candles, sessionType) {
        // Sessions are shown as colored background areas
        // We'll use markers on the candlestick series
        if (!candles || candles.length === 0) return;

        const sessions = sessionType === 'london'
            ? { startHour: 9, startMin: 0, endHour: 17, endMin: 30, color: 'rgba(79, 195, 247, 0.08)', label: 'LDN' }
            : { startHour: 15, startMin: 30, endHour: 22, endMin: 0, color: 'rgba(255, 112, 67, 0.08)', label: 'US' };

        // Group candles by day and find session HLOC
        const dayGroups = {};
        for (const c of candles) {
            const d = new Date(c.time * 1000);
            const h = d.getUTCHours() + d.getUTCMinutes() / 60;
            const dayKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;

            if (h >= sessions.startHour + sessions.startMin / 60 && h < sessions.endHour + sessions.endMin / 60) {
                if (!dayGroups[dayKey]) {
                    dayGroups[dayKey] = { open: c.open, high: c.high, low: c.low, close: c.close, startTime: c.time };
                } else {
                    dayGroups[dayKey].high = Math.max(dayGroups[dayKey].high, c.high);
                    dayGroups[dayKey].low = Math.min(dayGroups[dayKey].low, c.low);
                    dayGroups[dayKey].close = c.close;
                }
            }
        }

        // Add markers for session starts
        const markerColor = sessionType === 'london' ? '#4fc3f7' : '#ff7043';
        const markers = [];
        for (const [, s] of Object.entries(dayGroups)) {
            markers.push({
                time: s.startTime,
                position: 'aboveBar',
                color: markerColor,
                shape: 'square',
                text: `${sessions.label} O:${fmt(s.open)} H:${fmt(s.high)} L:${fmt(s.low)} C:${fmt(s.close)}`
            });
        }

        // Store existing markers & merge
        const existing = sessionMarkers.filter(m => m.sessionType !== sessionType);
        markers.forEach(m => m.sessionType = sessionType);
        sessionMarkers.length = 0;
        sessionMarkers.push(...existing, ...markers);

        // Apply all markers sorted by time
        const allMarkers = [...sessionMarkers].sort((a, b) => a.time - b.time);
        mainSeries.setMarkers(allMarkers);
    }

    function clearSessionMarkers(sessionType) {
        const remaining = sessionMarkers.filter(m => m.sessionType !== sessionType);
        sessionMarkers.length = 0;
        sessionMarkers.push(...remaining);

        if (remaining.length > 0) {
            const sorted = [...remaining].sort((a, b) => a.time - b.time);
            mainSeries.setMarkers(sorted);
        } else {
            mainSeries.setMarkers([]);
        }
    }

    // ─── Session Range Areas ──────────────────────────────
    const sessionRangeSeries = { london: [], us: [] };

    function getSessionConfig(sessionType) {
        return sessionType === 'london'
            ? { startHour: 9, startMin: 0, endHour: 17, endMin: 30 }
            : { startHour: 15, startMin: 30, endHour: 22, endMin: 0 };
    }

    function addSessionRange(candles, sessionType, color) {
        clearSessionRange(sessionType);
        if (!candles || candles.length === 0) return;

        const sess = getSessionConfig(sessionType);
        const fillColor = color + '30'; // ~19% opacity fill
        const borderColor = color + '66'; // ~40% opacity border

        // Group candles by day into session periods
        const dayGroups = {};
        for (const c of candles) {
            const d = new Date(c.time * 1000);
            const h = d.getUTCHours() + d.getUTCMinutes() / 60;
            const dayKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;

            if (h >= sess.startHour + sess.startMin / 60 && h < sess.endHour + sess.endMin / 60) {
                if (!dayGroups[dayKey]) {
                    dayGroups[dayKey] = { high: c.high, low: c.low, candles: [c] };
                } else {
                    dayGroups[dayKey].high = Math.max(dayGroups[dayKey].high, c.high);
                    dayGroups[dayKey].low = Math.min(dayGroups[dayKey].low, c.low);
                    dayGroups[dayKey].candles.push(c);
                }
            }
        }

        for (const [, g] of Object.entries(dayGroups)) {
            if (g.candles.length === 0) continue;

            const midPrice = (g.high + g.low) / 2;

            // Use a baseline series: baseValue at midPrice, fill above up to high, fill below down to low
            const baselineSeries = chart.addBaselineSeries({
                baseValue: { type: 'price', price: midPrice },
                topLineColor: borderColor,
                topFillColor1: fillColor,
                topFillColor2: fillColor,
                bottomLineColor: borderColor,
                bottomFillColor1: fillColor,
                bottomFillColor2: fillColor,
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle.Dotted,
                priceScaleId: 'right',
                lastValueVisible: false,
                priceLineVisible: false,
                crosshairMarkerVisible: false
            });

            // Alternate between high and low to fill the whole area
            const data = [];
            for (const c of g.candles) {
                data.push({ time: c.time, value: g.high });
            }
            // Add low points traveling backwards to fill area
            // Since baseline fills from line to baseValue, we use two series
            baselineSeries.setData(data);
            sessionRangeSeries[sessionType].push(baselineSeries);

            // Second series for the bottom half (from midPrice down to low)
            const baselineSeries2 = chart.addBaselineSeries({
                baseValue: { type: 'price', price: midPrice },
                topLineColor: 'transparent',
                topFillColor1: 'transparent',
                topFillColor2: 'transparent',
                bottomLineColor: borderColor,
                bottomFillColor1: fillColor,
                bottomFillColor2: fillColor,
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle.Dotted,
                priceScaleId: 'right',
                lastValueVisible: false,
                priceLineVisible: false,
                crosshairMarkerVisible: false
            });

            const data2 = g.candles.map(c => ({ time: c.time, value: g.low }));
            baselineSeries2.setData(data2);
            sessionRangeSeries[sessionType].push(baselineSeries2);
        }
    }

    function clearSessionRange(sessionType) {
        for (const s of sessionRangeSeries[sessionType]) {
            try { chart.removeSeries(s); } catch (e) { }
        }
        sessionRangeSeries[sessionType] = [];
    }

    // ─── Indicators ────────────────────────────────────────
    async function addIndicator(name, params = {}) {
        removeIndicator(name);

        const data = candleData;
        if (!data || data.length === 0) return;

        switch (name) {
            case 'sma': {
                const period = params.period || 20;
                const color = params.color || '#f5a623';
                const result = Indicators.sma(data, period);
                const series = chart.addLineSeries({ color, lineWidth: 1.5, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
                series.setData(result);
                indicatorSeries[name] = [series];
                break;
            }
            case 'ema': {
                const period = params.period || 21;
                const color = params.color || '#7b61ff';
                const result = Indicators.ema(data, period);
                const series = chart.addLineSeries({ color, lineWidth: 1.5, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
                series.setData(result);
                indicatorSeries[name] = [series];
                break;
            }
            case 'sma50': {
                const period = params.period || 50;
                const color = params.color || '#3498db';
                const result = Indicators.sma(data, period);
                const series = chart.addLineSeries({ color, lineWidth: 1.5, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
                series.setData(result);
                indicatorSeries[name] = [series];
                break;
            }
            case 'sma200': {
                const period = params.period || 200;
                const color = params.color || '#e74c3c';
                const result = Indicators.sma(data, period);
                const series = chart.addLineSeries({ color, lineWidth: 2, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
                series.setData(result);
                indicatorSeries[name] = [series];
                break;
            }
            case 'vix': {
                const color = params.color || '#ff6b6b';
                try {
                    const resp = await fetch('/api/candles?symbol=^VIX&interval=1d&count=500');
                    const vixData = await resp.json();
                    if (vixData.candles && vixData.candles.length > 0) {
                        const vixLine = vixData.candles.map(c => ({ time: c.time, value: c.close }));
                        const series = chart.addLineSeries({
                            color, lineWidth: 2,
                            priceScaleId: 'vix',
                            lastValueVisible: true,
                            priceLineVisible: true,
                            crosshairMarkerVisible: true,
                            title: 'VIX'
                        });
                        chart.priceScale('vix').applyOptions({
                            scaleMargins: { top: 0.7, bottom: 0.02 },
                            autoScale: true,
                            visible: true
                        });
                        series.setData(vixLine);
                        // Fear levels
                        const fear20 = chart.addLineSeries({ color: 'rgba(38,166,154,0.3)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, priceScaleId: 'vix', lastValueVisible: false, priceLineVisible: false });
                        const fear30 = chart.addLineSeries({ color: 'rgba(239,83,80,0.3)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, priceScaleId: 'vix', lastValueVisible: false, priceLineVisible: false });
                        fear20.setData(vixLine.map(r => ({ time: r.time, value: 20 })));
                        fear30.setData(vixLine.map(r => ({ time: r.time, value: 30 })));
                        indicatorSeries[name] = [series, fear20, fear30];
                    }
                } catch (e) { console.warn('VIX load failed:', e); }
                break;
            }
            case 'breadth': {
                const color = params.color || '#4ecdc4';
                try {
                    // Market breadth: compute advance/decline from SPY daily candles
                    const resp = await fetch('/api/candles?symbol=SPY&interval=1d&count=500');
                    const bData = await resp.json();
                    if (bData.candles && bData.candles.length > 1) {
                        let cumAD = 0;
                        const adLine = [];
                        for (let i = 1; i < bData.candles.length; i++) {
                            const c = bData.candles[i];
                            // Advance/Decline from candle internals
                            const hl = c.high - c.low;
                            if (hl > 0) {
                                const ad = ((c.close - c.low) - (c.high - c.close)) / hl;
                                cumAD += ad * (c.volume || 1) / 1e6;
                            }
                            adLine.push({ time: c.time, value: Math.round(cumAD * 100) / 100 });
                        }
                        const series = chart.addLineSeries({
                            color, lineWidth: 2,
                            priceScaleId: 'breadth',
                            lastValueVisible: true,
                            priceLineVisible: true,
                            crosshairMarkerVisible: true,
                            title: 'A/D'
                        });
                        chart.priceScale('breadth').applyOptions({
                            scaleMargins: { top: 0.7, bottom: 0.02 },
                            autoScale: true,
                            visible: true
                        });
                        series.setData(adLine);
                        // Zero line
                        const zeroLine = chart.addLineSeries({ color: 'rgba(255,255,255,0.15)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, priceScaleId: 'breadth', lastValueVisible: false, priceLineVisible: false });
                        zeroLine.setData(adLine.map(r => ({ time: r.time, value: 0 })));
                        indicatorSeries[name] = [series, zeroLine];
                    }
                } catch (e) { console.warn('Breadth load failed:', e); }
                break;
            }
            case 'divergence': {
                const color = params.color || '#ffd93d';
                // RSI divergence detection
                const rsiData = Indicators.rsi(data, 14);
                const markers = [];
                const lookback = 10;
                for (let i = lookback + 1; i < data.length; i++) {
                    const ri = rsiData.find(r => r.time === data[i].time);
                    const riPrev = rsiData.find(r => r.time === data[i - lookback]?.time);
                    if (!ri || !riPrev) continue;

                    // Bullish divergence: price makes lower low, RSI makes higher low
                    if (data[i].low < data[i - lookback].low && ri.value > riPrev.value && ri.value < 40) {
                        markers.push({ time: data[i].time, position: 'belowBar', color: '#26a69a', shape: 'arrowUp', text: 'Bull Div' });
                    }
                    // Bearish divergence: price makes higher high, RSI makes lower high
                    if (data[i].high > data[i - lookback].high && ri.value < riPrev.value && ri.value > 60) {
                        markers.push({ time: data[i].time, position: 'aboveBar', color: '#ef5350', shape: 'arrowDown', text: 'Bear Div' });
                    }
                }
                mainSeries.setMarkers(markers);
                indicatorSeries[name] = '_markers_'; // special flag for cleanup
                break;
            }
            case 'gamma': {
                const color = params.color || '#c084fc';
                try {
                    const resp = await fetch('/api/candles?symbol=^VIX&interval=1d&count=500');
                    const gData = await resp.json();
                    if (gData.candles && gData.candles.length > 5) {
                        // Gamma proxy: VIX rate of change (smoothed) — negative = positive gamma environment
                        const gammaLine = [];
                        for (let i = 5; i < gData.candles.length; i++) {
                            const roc = ((gData.candles[i].close - gData.candles[i - 5].close) / gData.candles[i - 5].close) * 100;
                            gammaLine.push({ time: gData.candles[i].time, value: Math.round(-roc * 100) / 100 });
                        }
                        const series = chart.addLineSeries({
                            color, lineWidth: 2,
                            priceScaleId: 'gamma',
                            lastValueVisible: true,
                            priceLineVisible: true,
                            crosshairMarkerVisible: true,
                            title: 'GEX'
                        });
                        chart.priceScale('gamma').applyOptions({
                            scaleMargins: { top: 0.7, bottom: 0.02 },
                            autoScale: true,
                            visible: true
                        });
                        series.setData(gammaLine);
                        // Zero line
                        const zLine = chart.addLineSeries({ color: 'rgba(255,255,255,0.15)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, priceScaleId: 'gamma', lastValueVisible: false, priceLineVisible: false });
                        zLine.setData(gammaLine.map(r => ({ time: r.time, value: 0 })));
                        indicatorSeries[name] = [series, zLine];
                    }
                } catch (e) { console.warn('Gamma load failed:', e); }
                break;
            }
            case 'cot': {
                const color = params.color || '#45b7d1';
                try {
                    // Fetch real CFTC COT data
                    const cotResp = await fetch('/api/cot');
                    const cotJson = await cotResp.json();

                    // Also get SPY weekly for the timeline
                    const spyResp = await fetch('/api/candles?symbol=SPY&interval=1wk&count=200');
                    const spyData = await spyResp.json();

                    if (spyData.candles && spyData.candles.length > 1) {
                        let cumFlow = 0;
                        const cotLine = [];
                        for (let i = 1; i < spyData.candles.length; i++) {
                            const c = spyData.candles[i];
                            const hl = c.high - c.low;
                            if (hl > 0) {
                                const mfm = ((c.close - c.low) - (c.high - c.close)) / hl;
                                cumFlow += mfm * (c.volume || 0) / 1e6;
                            }
                            cotLine.push({ time: c.time, value: Math.round(cumFlow * 10) / 10 });
                        }

                        // Build title with real CFTC data
                        let cotTitle = 'COT';
                        if (cotJson.instruments) {
                            const sp = cotJson.instruments.find(i => i.code === '13874A' || i.code === '13874+');
                            if (sp) {
                                const net = sp.nonCommercial.net;
                                cotTitle = `COT Net: ${net > 0 ? '+' : ''}${net.toLocaleString()}`;
                            }
                        }

                        const series = chart.addLineSeries({
                            color, lineWidth: 2,
                            priceScaleId: 'cot',
                            lastValueVisible: true,
                            priceLineVisible: true,
                            crosshairMarkerVisible: true,
                            title: cotTitle
                        });
                        chart.priceScale('cot').applyOptions({
                            scaleMargins: { top: 0.7, bottom: 0.02 },
                            autoScale: true,
                            visible: true
                        });
                        series.setData(cotLine);
                        const zLine = chart.addLineSeries({ color: 'rgba(255,255,255,0.15)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, priceScaleId: 'cot', lastValueVisible: false, priceLineVisible: false });
                        zLine.setData(cotLine.map(r => ({ time: r.time, value: 0 })));
                        indicatorSeries[name] = [series, zLine];
                    }
                } catch (e) { console.warn('COT load failed:', e); }
                break;
            }
            case 'rsi': {
                const period = params.period || 14;
                const color = params.color || '#00d4aa';
                const result = Indicators.rsi(data, period);
                const series = chart.addLineSeries({
                    color, lineWidth: 1.5,
                    priceScaleId: 'rsi',
                    lastValueVisible: true,
                    priceLineVisible: false
                });
                chart.priceScale('rsi').applyOptions({
                    scaleMargins: { top: 0.75, bottom: 0.02 },
                    autoScale: true
                });
                series.setData(result);

                // Add 30/70 lines
                const line30 = chart.addLineSeries({ color: 'rgba(239, 83, 80, 0.3)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, priceScaleId: 'rsi', lastValueVisible: false, priceLineVisible: false });
                const line70 = chart.addLineSeries({ color: 'rgba(38, 166, 154, 0.3)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, priceScaleId: 'rsi', lastValueVisible: false, priceLineVisible: false });
                line30.setData(result.map(r => ({ time: r.time, value: 30 })));
                line70.setData(result.map(r => ({ time: r.time, value: 70 })));
                indicatorSeries[name] = [series, line30, line70];
                break;
            }
            case 'macd': {
                const color = params.color || '#2196F3';
                const result = Indicators.macd(data);

                const macdLine = chart.addLineSeries({ color, lineWidth: 1.5, priceScaleId: 'macd', lastValueVisible: false, priceLineVisible: false });
                const signalLine = chart.addLineSeries({ color: '#ff7043', lineWidth: 1.5, priceScaleId: 'macd', lastValueVisible: false, priceLineVisible: false });
                const histogram = chart.addHistogramSeries({ priceScaleId: 'macd', lastValueVisible: false, priceLineVisible: false });

                chart.priceScale('macd').applyOptions({
                    scaleMargins: { top: 0.75, bottom: 0.02 },
                    autoScale: true
                });

                macdLine.setData(result.macdLine);
                signalLine.setData(result.signalLine);
                histogram.setData(result.histogram);
                indicatorSeries[name] = [macdLine, signalLine, histogram];
                break;
            }
            case 'bb': {
                const period = params.period || 20;
                const color = params.color || '#9b59b6';
                const result = Indicators.bollingerBands(data, period);

                const upper = chart.addLineSeries({ color, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
                const middle = chart.addLineSeries({ color, lineWidth: 1, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });
                const lower = chart.addLineSeries({ color, lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false });

                upper.setData(result.upper);
                middle.setData(result.middle);
                lower.setData(result.lower);
                indicatorSeries[name] = [upper, middle, lower];
                break;
            }
            case 'volume': {
                volumeSeries.applyOptions({ visible: true });
                indicatorSeries[name] = []; // placeholder
                // Subscribe to visible range to track max volume
                updateMaxVolumeLine();
                maxVolRangeSub = () => updateMaxVolumeLine();
                chart.timeScale().subscribeVisibleLogicalRangeChange(maxVolRangeSub);
                break;
            }
        }
    }

    function removeIndicator(name) {
        if (indicatorSeries[name]) {
            // Special handling for divergence markers
            if (indicatorSeries[name] === '_markers_') {
                try { mainSeries.setMarkers([]); } catch (e) { }
                delete indicatorSeries[name];
                return;
            }
            for (const s of indicatorSeries[name]) {
                try { chart.removeSeries(s); } catch (e) { }
            }
            delete indicatorSeries[name];
        }
        if (name === 'volume') {
            volumeSeries.applyOptions({ visible: false });
            // Clean up max vol line & subscription
            if (maxVolPriceLine) {
                try { volumeSeries.removePriceLine(maxVolPriceLine); } catch (e) { }
                maxVolPriceLine = null;
            }
            if (maxVolRangeSub) {
                chart.timeScale().unsubscribeVisibleLogicalRangeChange(maxVolRangeSub);
                maxVolRangeSub = null;
            }
        }
    }

    // ─── Max Volume Line ──────────────────────────────────
    let maxVolPriceLine = null;
    let maxVolRangeSub = null;

    function updateMaxVolumeLine() {
        // Remove old line
        if (maxVolPriceLine) {
            try { volumeSeries.removePriceLine(maxVolPriceLine); } catch (e) { }
            maxVolPriceLine = null;
        }

        const range = chart.timeScale().getVisibleLogicalRange();
        if (!range) return;

        const volData = Indicators.volume(rawCandleData.length ? rawCandleData : candleData);
        if (!volData || volData.length === 0) return;

        const from = Math.max(0, Math.floor(range.from));
        const to = Math.min(volData.length - 1, Math.ceil(range.to));

        let maxVol = 0;
        for (let i = from; i <= to; i++) {
            if (volData[i] && volData[i].value > maxVol) {
                maxVol = volData[i].value;
            }
        }

        if (maxVol > 0) {
            // Format volume for label
            let label;
            if (maxVol >= 1e9) label = (maxVol / 1e9).toFixed(2) + 'B';
            else if (maxVol >= 1e6) label = (maxVol / 1e6).toFixed(2) + 'M';
            else if (maxVol >= 1e3) label = (maxVol / 1e3).toFixed(1) + 'K';
            else label = maxVol.toString();

            maxVolPriceLine = volumeSeries.createPriceLine({
                price: maxVol,
                color: 'rgba(99, 115, 148, 0.4)',
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle.Dotted,
                axisLabelVisible: true,
                title: label,
                lineVisible: true
            });
        }
    }

    function updateAllIndicators() {
        // Re-apply all active indicators with fresh data
        for (const name of Object.keys(indicatorSeries)) {
            const toggle = document.querySelector(`[data-indicator="${name}"]`);
            if (toggle && toggle.checked) {
                const params = getIndicatorParams(name);
                addIndicator(name, params);
            }
        }
    }

    function getIndicatorParams(name) {
        const params = {};
        const periodEl = document.querySelector(`[data-param="${name}-period"]`);
        const colorEl = document.querySelector(`[data-param="${name}-color"]`);
        if (periodEl) params.period = parseInt(periodEl.value);
        if (colorEl) params.color = colorEl.value;
        return params;
    }

    // ─── Multi-Timeframe ──────────────────────────────────
    function addMTFOverlay(index, candles, upColor, downColor) {
        removeMTFOverlay(index);

        const series = chart.addCandlestickSeries({
            upColor: upColor + '66', // semi-transparent
            downColor: downColor + '66',
            borderUpColor: upColor + '99',
            borderDownColor: downColor + '99',
            wickUpColor: upColor + '99',
            wickDownColor: downColor + '99',
            priceScaleId: 'right',
            lastValueVisible: false,
            priceLineVisible: false
        });

        series.setData(candles);
        mtfSeries[index] = series;
    }

    function removeMTFOverlay(index) {
        if (mtfSeries[index]) {
            try { chart.removeSeries(mtfSeries[index]); } catch (e) { }
            delete mtfSeries[index];
        }
    }

    // ─── Daily Range Overlay ───────────────────────────────
    const dailyRangeAreas = [];

    function addDailyRangeOverlay(ranges, days, color, lineWidth, lineStyle) {
        clearDailyRangeOverlay();
        if (!ranges || ranges.length === 0 || !candleData.length) return;

        const lw = lineWidth || 2;
        const ls = lineStyle != null ? lineStyle : LightweightCharts.LineStyle.Dotted;

        const lastN = ranges.slice(-days);
        const borderColor = color + '88'; // ~53% opacity

        for (const day of lastN) {
            const dayDate = new Date(day.date);

            // Find candles that belong to this day
            const dayCandles = candleData.filter(c => {
                const cd = new Date(c.time * 1000);
                return cd.getUTCFullYear() === dayDate.getUTCFullYear() &&
                    cd.getUTCMonth() === dayDate.getUTCMonth() &&
                    cd.getUTCDate() === dayDate.getUTCDate();
            });

            if (dayCandles.length === 0) {
                // For daily+ TF, find the candle matching this date
                const matchCandle = candleData.find(c => {
                    const cd = new Date(c.time * 1000);
                    return cd.getUTCFullYear() === dayDate.getUTCFullYear() &&
                        cd.getUTCMonth() === dayDate.getUTCMonth() &&
                        cd.getUTCDate() === dayDate.getUTCDate();
                });
                if (!matchCandle) continue;
                const hiLine = mainSeries.createPriceLine({
                    price: day.high, color: borderColor, lineWidth: lw,
                    lineStyle: ls,
                    axisLabelVisible: false, title: '', lineVisible: true
                });
                const loLine = mainSeries.createPriceLine({
                    price: day.low, color: borderColor, lineWidth: lw,
                    lineStyle: ls,
                    axisLabelVisible: false, title: '', lineVisible: true
                });
                dailyRangeAreas.push({ type: 'lines', hi: hiLine, lo: loLine });
                continue;
            }

            // Create area between high and low using two line series
            const topData = dayCandles.map(c => ({ time: c.time, value: day.high }));
            const botData = dayCandles.map(c => ({ time: c.time, value: day.low }));

            const topSeries = chart.addLineSeries({
                color: borderColor, lineWidth: lw,
                lineStyle: ls,
                priceScaleId: 'right',
                lastValueVisible: false, priceLineVisible: false,
                crosshairMarkerVisible: false
            });

            const botSeries = chart.addLineSeries({
                color: borderColor, lineWidth: lw,
                lineStyle: ls,
                priceScaleId: 'right',
                lastValueVisible: false, priceLineVisible: false,
                crosshairMarkerVisible: false
            });

            topSeries.setData(topData);
            botSeries.setData(botData);
            dailyRangeAreas.push({ type: 'series', top: topSeries, bot: botSeries });
        }
    }

    function clearDailyRangeOverlay() {
        for (const area of dailyRangeAreas) {
            if (area.type === 'series') {
                try { chart.removeSeries(area.top); } catch (e) { }
                try { chart.removeSeries(area.bot); } catch (e) { }
            } else if (area.type === 'lines') {
                try { mainSeries.removePriceLine(area.hi); } catch (e) { }
                try { mainSeries.removePriceLine(area.lo); } catch (e) { }
            }
        }
        dailyRangeAreas.length = 0;
    }

    // ─── Prediction Lines ───────────────────────────────────
    const predictionLines = [];

    function drawPredictionLines(entry, target, sl, direction) {
        clearPredictionLines();
        if (!mainSeries) return;

        const isLong = direction === 'long';

        // Entry line — white
        const entryLine = mainSeries.createPriceLine({
            price: entry,
            color: '#ffffff',
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Solid,
            axisLabelVisible: true,
            title: `${isLong ? '▲' : '▼'} Entry`,
            lineVisible: true
        });
        predictionLines.push(entryLine);

        // Target line — green for long, red for short
        const targetLine = mainSeries.createPriceLine({
            price: target,
            color: isLong ? '#26a69a' : '#ef5350',
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'Target',
            lineVisible: true
        });
        predictionLines.push(targetLine);

        // SL line — red for long, green for short
        const slLine = mainSeries.createPriceLine({
            price: sl,
            color: isLong ? '#ef5350' : '#26a69a',
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Dotted,
            axisLabelVisible: true,
            title: 'SL',
            lineVisible: true
        });
        predictionLines.push(slLine);
    }

    function clearPredictionLines() {
        for (const line of predictionLines) {
            try { mainSeries.removePriceLine(line); } catch (e) { }
        }
        predictionLines.length = 0;
    }

    // ─── Percent Mode ───────────────────────────────────────
    function togglePercentMode(enable) {
        if (!chart) return;
        isPercentMode = enable;
        chart.applyOptions({
            rightPriceScale: {
                mode: enable
                    ? LightweightCharts.PriceScaleMode.Percentage
                    : LightweightCharts.PriceScaleMode.Normal
            }
        });
    }

    // ─── Currency Conversion ────────────────────────────────
    function scaleCandles(candles, rate) {
        return candles.map(c => ({
            time: c.time,
            open: c.open * rate,
            high: c.high * rate,
            low: c.low * rate,
            close: c.close * rate
        }));
    }

    function setCurrency(code, rate) {
        // rate = null means reset to native
        if (!rate || rate === 1) {
            activeCurrency = null;
        } else {
            activeCurrency = { code, rate };
        }

        // Re-apply data with new rate
        if (rawCandleData.length) {
            candleData = activeCurrency ? scaleCandles(rawCandleData, activeCurrency.rate) : rawCandleData;
            mainSeries.setData(candleData);

            // Re-set current price line if it exists
            if (currentPriceLine) {
                const origPrice = currentPriceLine.options().price;
                // Don't re-scale — caller should call setCurrentPriceLine with new price
            }
        }
    }

    function getActiveCurrency() {
        return activeCurrency;
    }

    // ─── Resize ────────────────────────────────────────────
    function resize() {
        const container = document.getElementById('chart');
        if (chart && container.clientWidth > 0 && container.clientHeight > 0) {
            chart.resize(container.clientWidth, container.clientHeight);
        }
    }

    // ─── Alert Lines ──────────────────────────────────────
    const alertLines = {};  // id -> priceLine

    function addAlertLine(id, price, color) {
        removeAlertLine(id);
        alertLines[id] = mainSeries.createPriceLine({
            price: price,
            color: color,
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: true,
            title: '⚡ Alert',
            lineVisible: true
        });
    }

    function removeAlertLine(id) {
        if (alertLines[id]) {
            try { mainSeries.removePriceLine(alertLines[id]); } catch (e) { }
            delete alertLines[id];
        }
    }

    function clearAllAlertLines() {
        for (const id of Object.keys(alertLines)) {
            removeAlertLine(id);
        }
    }

    return {
        init, setData, getData, resize,
        setCurrentPriceLine, setSLPriceLine, removeSLLine,
        setMondayRange, clearMondayRange,
        addSessionMarkers, clearSessionMarkers,
        addSessionRange, clearSessionRange,
        addIndicator, removeIndicator,
        addMTFOverlay, removeMTFOverlay,
        addDailyRangeOverlay, clearDailyRangeOverlay,
        drawPredictionLines, clearPredictionLines,
        togglePercentMode, setCurrency, getActiveCurrency,
        getIndicatorParams, fmt,
        addAlertLine, removeAlertLine, clearAllAlertLines
    };
})();
