/* ═══════════════════════════════════════════════════════════════
   INDICATORS.JS — Technical indicator calculations
   ═══════════════════════════════════════════════════════════════ */

const Indicators = (() => {

    /** Simple Moving Average */
    function sma(data, period) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                result.push({ time: data[i].time, value: undefined });
                continue;
            }
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) {
                sum += data[j].close;
            }
            result.push({ time: data[i].time, value: sum / period });
        }
        return result.filter(r => r.value !== undefined);
    }

    /** Exponential Moving Average */
    function ema(data, period) {
        const result = [];
        const multiplier = 2 / (period + 1);

        // Start with SMA for first value
        let sum = 0;
        for (let i = 0; i < Math.min(period, data.length); i++) {
            sum += data[i].close;
        }
        if (data.length < period) return [];

        let prevEma = sum / period;
        result.push({ time: data[period - 1].time, value: prevEma });

        for (let i = period; i < data.length; i++) {
            const val = (data[i].close - prevEma) * multiplier + prevEma;
            result.push({ time: data[i].time, value: val });
            prevEma = val;
        }
        return result;
    }

    /** Relative Strength Index */
    function rsi(data, period = 14) {
        if (data.length < period + 1) return [];

        const gains = [];
        const losses = [];

        for (let i = 1; i < data.length; i++) {
            const diff = data[i].close - data[i - 1].close;
            gains.push(diff > 0 ? diff : 0);
            losses.push(diff < 0 ? -diff : 0);
        }

        let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
        let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

        const result = [];
        for (let i = period; i < gains.length; i++) {
            if (i > period) {
                avgGain = (avgGain * (period - 1) + gains[i]) / period;
                avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
            }
            const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            const rsiVal = 100 - (100 / (1 + rs));
            result.push({ time: data[i + 1] ? data[i + 1].time : data[i].time, value: rsiVal });
        }
        return result;
    }

    /** MACD (12, 26, 9) */
    function macd(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        const fastEma = ema(data, fastPeriod);
        const slowEma = ema(data, slowPeriod);

        if (fastEma.length === 0 || slowEma.length === 0) return { macdLine: [], signalLine: [], histogram: [] };

        // Align by time
        const slowMap = new Map(slowEma.map(e => [e.time, e.value]));
        const macdLine = [];
        for (const f of fastEma) {
            const s = slowMap.get(f.time);
            if (s !== undefined) {
                macdLine.push({ time: f.time, close: f.value - s, value: f.value - s });
            }
        }

        // Signal line = EMA of MACD line
        const signalLine = ema(macdLine.map(m => ({ time: m.time, close: m.value })), signalPeriod);
        const signalMap = new Map(signalLine.map(s => [s.time, s.value]));

        const histogram = [];
        for (const m of macdLine) {
            const sig = signalMap.get(m.time);
            if (sig !== undefined) {
                histogram.push({
                    time: m.time,
                    value: m.value - sig,
                    color: m.value - sig >= 0 ? 'rgba(38, 166, 154, 0.6)' : 'rgba(239, 83, 80, 0.6)'
                });
            }
        }

        return {
            macdLine: macdLine.map(m => ({ time: m.time, value: m.value })),
            signalLine,
            histogram
        };
    }

    /** Bollinger Bands (SMA + 2 std dev) */
    function bollingerBands(data, period = 20, stdDev = 2) {
        const upper = [];
        const middle = [];
        const lower = [];

        for (let i = period - 1; i < data.length; i++) {
            let sum = 0;
            for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
            const avg = sum / period;

            let sqSum = 0;
            for (let j = i - period + 1; j <= i; j++) sqSum += Math.pow(data[j].close - avg, 2);
            const std = Math.sqrt(sqSum / period);

            middle.push({ time: data[i].time, value: avg });
            upper.push({ time: data[i].time, value: avg + stdDev * std });
            lower.push({ time: data[i].time, value: avg - stdDev * std });
        }

        return { upper, middle, lower };
    }

    /** Volume data formatted for histogram */
    function volume(data) {
        return data.map(d => ({
            time: d.time,
            value: d.volume || 0,
            color: d.close >= d.open ? 'rgba(38, 166, 154, 0.35)' : 'rgba(239, 83, 80, 0.35)'
        }));
    }

    return { sma, ema, rsi, macd, bollingerBands, volume };
})();
