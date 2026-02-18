// app.js – Financial Controlling Dashboard logic
const D = FINANCIAL_DATA;
const CZK = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const CZKshort = n => { const a = Math.abs(n), s = n < 0 ? '−' : ''; if (a >= 1e9) return s + (a / 1e9).toFixed(1).replace('.', ',') + ' mld. Kč'; if (a >= 1e6) return s + (a / 1e6).toFixed(1).replace('.', ',') + ' mil. Kč'; if (a >= 1e3) return s + (a / 1e3).toFixed(0) + ' tis. Kč'; return CZK.format(n) };
const pct = n => n.toFixed(1).replace('.', ',') + ' %';
const mN = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'];
const fmtP = p => { const [y, m] = p.split('-'); return mN[parseInt(m) - 1] + ' ' + y };
const fmtPS = p => { const [y, m] = p.split('-'); return mN[parseInt(m) - 1] + ' ' + y.slice(2) };
const qFromP = p => { const m = parseInt(p.split('-')[1]); return 'Q' + Math.ceil(m / 3) };

function valCls(n) { return n > 0 ? 'val-positive' : n < 0 ? 'val-negative' : 'val-neutral' }
function yoyBadge(cur, prev) {
    if (prev == null) return ''; if (prev === 0 && cur === 0) return '<div class="yoy yoy-flat">— beze změny</div>';
    if (prev === 0) return '<div class="yoy yoy-up">↑ ∞ %</div>';
    const c = ((cur - prev) / Math.abs(prev)) * 100, ar = c > 0 ? '↑' : c < 0 ? '↓' : '→', cl = c > 0 ? 'yoy-up' : c < 0 ? 'yoy-down' : 'yoy-flat';
    return `<div class="yoy ${cl}">${ar} ${Math.abs(c).toFixed(1).replace('.', ',')} % YoY</div>`;
}
function heroCard(l, v, sub, g = 'glow-indigo', raw = null, yh = '') {
    const cc = raw !== null ? ' ' + valCls(raw) : '';
    return `<div class="hero-card"><div class="glow ${g}"></div><div class="label">${l}</div><div class="value${cc}">${v}</div>${yh}<div class="sub">${sub}</div></div>`;
}

const COLORS = { indigo: '#6366f1', violet: '#8b5cf6', blue: '#3b82f6', green: '#10b981', amber: '#f59e0b', rose: '#f43f5e', cyan: '#06b6d4', pink: '#ec4899', teal: '#14b8a6', orange: '#f97316' };
const CA = Object.values(COLORS);
const aC = (h, a) => { const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); return `rgba(${r},${g},${b},${a})` };
Chart.defaults.elements.point.pointStyle = 'circle';
const bO = () => ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#9ca3af', font: { size: 11, family: 'Inter' }, padding: 14, usePointStyle: true, pointStyle: 'circle' } }, tooltip: { backgroundColor: 'rgba(17,24,39,0.95)', titleColor: '#f9fafb', bodyColor: '#d1d5db', borderColor: 'rgba(75,85,99,0.3)', borderWidth: 1, padding: 10, cornerRadius: 8, titleFont: { weight: '600', family: 'Inter' }, bodyFont: { family: 'Inter' }, callbacks: { label: ctx => { const v = ctx.parsed.y ?? ctx.parsed; return ctx.dataset.label + ': ' + CZK.format(Math.round(v)) } } } }, scales: { x: { ticks: { color: '#6b7280', font: { size: 10, family: 'Inter' } }, grid: { color: 'rgba(75,85,99,0.12)' } }, y: { ticks: { color: '#6b7280', font: { size: 10, family: 'Inter' }, callback: v => CZKshort(v) }, grid: { color: 'rgba(75,85,99,0.12)' } } } });
const pctScale = { position: 'right', ticks: { color: '#f59e0b', font: { size: 10 }, callback: v => v.toFixed(0) + '%' }, grid: { drawOnChartArea: false } };

// ── FILTERS ──
const elY = document.getElementById('filter-year'), elQ = document.getElementById('filter-quarter'), elR = document.getElementById('filter-region'), elC = document.getElementById('filter-cc'), elCat = document.getElementById('filter-category');
D.filters.years.forEach(y => { const o = document.createElement('option'); o.value = y; o.textContent = y; elY.appendChild(o) });
D.filters.quarters.forEach(q => { const o = document.createElement('option'); o.value = q; o.textContent = q; elQ.appendChild(o) });
D.filters.regions.forEach(r => { const o = document.createElement('option'); o.value = r; o.textContent = r; elR.appendChild(o) });
D.filters.cost_centers.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.id + ' – ' + c.name; elC.appendChild(o) });
D.filters.categories.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; elCat.appendChild(o) });

const gF = () => ({ year: elY.value, quarter: elQ.value, region: elR.value, cc: elC.value, category: elCat.value });
const mY = (p, y) => y === 'all' || p.startsWith(y);
const mQ = (row, q) => q === 'all' || (row.quarter || qFromP(row.period)) === q;
const mQp = (p, q) => q === 'all' || qFromP(p) === q;
const mR = (r, f) => f === 'all' || r.region === f;
const mC = (r, f) => f === 'all' || r.cost_center_id === f;
const mCat = (r, f) => f === 'all' || r.product_category === f;

document.querySelectorAll('.tab').forEach(t => { t.addEventListener('click', () => { document.querySelectorAll('.tab').forEach(x => x.classList.remove('active')); document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active')); t.classList.add('active'); document.getElementById('panel-' + t.dataset.tab).classList.add('active') }) });

const charts = {};
function mc(id, cfg) { if (charts[id]) charts[id].destroy(); if (cfg.data?.datasets) cfg.data.datasets.forEach(ds => { if (!ds.pointStyle) ds.pointStyle = 'circle' }); charts[id] = new Chart(document.getElementById(id), cfg) }

function renderAll() { const f = gF(); renderKPIs(f); renderOPEX(f); renderCAPEX(f); renderHR(f); renderSales(f); renderVariance(f) }

// ── KPIs ──
function renderKPIs(f) {
    const data = D.kpis.filter(r => mY(r.period, f.year) && mQp(r.period, f.quarter));
    if (!data.length) { document.getElementById('kpi-heroes').innerHTML = '<p style="color:var(--text-muted)">Žádná data</p>'; return }
    const tR = data.reduce((s, r) => s + r.revenue, 0), tE = data.reduce((s, r) => s + r.ebitda, 0);
    const aGM = data.reduce((s, r) => s + r.gross_margin_pct, 0) / data.length, aEM = data.reduce((s, r) => s + r.ebitda_margin_pct, 0) / data.length;
    const aDSO = data.reduce((s, r) => s + r.dso_days, 0) / data.length, aDPO = data.reduce((s, r) => s + r.dpo_days, 0) / data.length;
    let pY = null;
    if (f.year !== 'all') { const py = String(parseInt(f.year) - 1); const pd = D.kpis.filter(r => r.period.startsWith(py) && mQp(r.period, f.quarter)); if (pd.length) pY = { rev: pd.reduce((s, r) => s + r.revenue, 0), ebitda: pd.reduce((s, r) => s + r.ebitda, 0), em: pd.reduce((s, r) => s + r.ebitda_margin_pct, 0) / pd.length, gm: pd.reduce((s, r) => s + r.gross_margin_pct, 0) / pd.length, dso: pd.reduce((s, r) => s + r.dso_days, 0) / pd.length, dpo: pd.reduce((s, r) => s + r.dpo_days, 0) / pd.length } }
    document.getElementById('kpi-heroes').innerHTML = [
        heroCard('Celkové tržby', CZKshort(tR), f.year === 'all' ? 'Celé období' : 'Rok ' + f.year, 'glow-green', tR, pY ? yoyBadge(tR, pY.rev) : ''),
        heroCard('EBITDA', CZKshort(tE), 'Provozní zisk před odpisy', 'glow-indigo', tE, pY ? yoyBadge(tE, pY.ebitda) : ''),
        heroCard('EBITDA marže', pct(aEM), 'Průměr za období', 'glow-violet', aEM, pY ? yoyBadge(aEM, pY.em) : ''),
        heroCard('Hrubá marže', pct(aGM), 'Tržby − COGS / Tržby', 'glow-blue', aGM, pY ? yoyBadge(aGM, pY.gm) : ''),
        heroCard('Průměr DSO', Math.round(aDSO) + ' dní', 'Doba splatnosti pohledávek', 'glow-amber', null, pY ? yoyBadge(aDSO, pY.dso) : ''),
        heroCard('Průměr DPO', Math.round(aDPO) + ' dní', 'Doba splatnosti závazků', 'glow-rose', null, pY ? yoyBadge(aDPO, pY.dpo) : ''),
    ].join('');
    const lb = data.map(r => fmtPS(r.period));
    mc('c-kpi-ebitda', { type: 'bar', data: { labels: lb, datasets: [{ label: 'Tržby', data: data.map(r => r.revenue), backgroundColor: aC(COLORS.indigo, 0.5), borderColor: COLORS.indigo, borderWidth: 1, borderRadius: 3, order: 2 }, { label: 'EBITDA', data: data.map(r => r.ebitda), type: 'line', borderColor: COLORS.green, backgroundColor: aC(COLORS.green, 0.1), pointRadius: 2, tension: .3, fill: true, order: 1 }] }, options: bO() });
    mc('c-kpi-margins', { type: 'line', data: { labels: lb, datasets: [{ label: 'EBITDA marže %', data: data.map(r => r.ebitda_margin_pct), borderColor: COLORS.indigo, tension: .3, pointRadius: 2 }, { label: 'Hrubá marže %', data: data.map(r => r.gross_margin_pct), borderColor: COLORS.green, tension: .3, pointRadius: 2 }, { label: 'ROA %', data: data.map(r => r.roa_pct), borderColor: COLORS.amber, tension: .3, pointRadius: 2 }] }, options: { ...bO(), plugins: { ...bO().plugins, tooltip: { ...bO().plugins.tooltip, callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1).replace('.', ',') + ' %' } } }, scales: { ...bO().scales, y: { ticks: { color: '#6b7280', font: { size: 10 }, callback: v => v.toFixed(0) + ' %' }, grid: { color: 'rgba(75,85,99,0.12)' } } } } });
    mc('c-kpi-dso', { type: 'line', data: { labels: lb, datasets: [{ label: 'DSO (dny)', data: data.map(r => r.dso_days), borderColor: COLORS.blue, backgroundColor: aC(COLORS.blue, 0.1), tension: .3, fill: true, pointRadius: 2 }, { label: 'DPO (dny)', data: data.map(r => r.dpo_days), borderColor: COLORS.amber, backgroundColor: aC(COLORS.amber, 0.1), tension: .3, fill: true, pointRadius: 2 }] }, options: { ...bO(), plugins: { ...bO().plugins, tooltip: { ...bO().plugins.tooltip, callbacks: { label: ctx => ctx.dataset.label + ': ' + Math.round(ctx.parsed.y) + ' dní' } } }, scales: { ...bO().scales, y: { ticks: { color: '#6b7280', font: { size: 10 }, callback: v => v + ' dní' }, grid: { color: 'rgba(75,85,99,0.12)' } } } } });
    mc('c-kpi-cf', { type: 'bar', data: { labels: lb, datasets: [{ label: 'Příjmy', data: data.map(r => r.cash_inflow), backgroundColor: aC(COLORS.green, 0.45), borderRadius: 3 }, { label: 'Výdaje', data: data.map(r => r.cash_outflow), backgroundColor: aC(COLORS.rose, 0.4), borderRadius: 3 }, { label: 'Čistý CF', data: data.map(r => r.net_cashflow), type: 'line', borderColor: COLORS.blue, pointRadius: 2, tension: .3 }] }, options: bO() });
}

// ── OPEX ──
function renderOPEX(f) {
    const rows = D.opex.filter(r => mY(r.period, f.year) && mQp(r.period, f.quarter) && mR(r, f.region) && mC(r, f.cc));
    const byCat = {}, byPC = {};
    rows.forEach(r => { if (!byCat[r.category]) byCat[r.category] = { p: 0, a: 0 }; byCat[r.category].p += r.planned; byCat[r.category].a += r.actual; if (!byPC[r.period]) byPC[r.period] = {}; if (!byPC[r.period][r.category]) byPC[r.period][r.category] = 0; byPC[r.period][r.category] += r.actual });
    const cats = Object.keys(byCat).sort(), tP = Object.values(byCat).reduce((s, c) => s + c.p, 0), tA = Object.values(byCat).reduce((s, c) => s + c.a, 0), tV = tA - tP;
    const big = cats.reduce((a, c) => byCat[c].a > byCat[a].a ? c : a, cats[0] || '');
    document.getElementById('opex-heroes').innerHTML = [
        heroCard('Plán OPEX', CZKshort(tP), 'Rozpočet', 'glow-amber', tP),
        heroCard('Skutečnost', CZKshort(tA), `${tV >= 0 ? '▲' : '▼'} ${pct(tP ? tV / tP * 100 : 0)} vs plán`, 'glow-indigo', tA),
        heroCard('Největší kat.', big, CZKshort(byCat[big]?.a || 0), 'glow-violet'),
        heroCard('Celková odchylka', CZKshort(tV), tV > 0 ? '<span class="down">Přečerpáno</span>' : '<span class="up">Úspora</span>', 'glow-rose', tV),
    ].join('');
    mc('c-opex-bar', { type: 'bar', data: { labels: cats, datasets: [{ label: 'Plán', data: cats.map(c => byCat[c].p), backgroundColor: aC(COLORS.blue, 0.45), borderRadius: 3 }, { label: 'Skutečnost', data: cats.map(c => byCat[c].a), backgroundColor: aC(COLORS.indigo, 0.65), borderRadius: 3 }] }, options: { ...bO(), indexAxis: 'y' } });
    mc('c-opex-doughnut', { type: 'doughnut', data: { labels: cats, datasets: [{ data: cats.map(c => byCat[c].a), backgroundColor: CA.slice(0, cats.length), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { labels: { color: '#9ca3af', font: { size: 11, family: 'Inter' }, padding: 10, usePointStyle: true, pointStyle: 'circle' } }, tooltip: { callbacks: { label: ctx => ctx.label + ': ' + CZK.format(Math.round(ctx.parsed)) } } } } });
    const per = Object.keys(byPC).sort(), top4 = cats.slice(0, 4);
    mc('c-opex-monthly', { type: 'line', data: { labels: per.map(fmtPS), datasets: top4.map((c, i) => ({ label: c, data: per.map(p => (byPC[p] || {})[c] || 0), borderColor: CA[i], tension: .3, pointRadius: 2 })) }, options: bO() });
}

// ── CAPEX ──
function renderCAPEX(f) {
    const rows = D.capex.filter(r => mY(r.period, f.year) && mQp(r.period, f.quarter) && mR(r, f.region) && mC(r, f.cc));
    const byCat = {}, byP = {};
    rows.forEach(r => { const c = r.asset_category; if (!byCat[c]) byCat[c] = { i: 0, d: 0 }; byCat[c].i += r.investment; byCat[c].d += r.depreciation; if (!byP[r.period]) byP[r.period] = { i: 0, d: 0 }; byP[r.period].i += r.investment; byP[r.period].d += r.depreciation });
    const cats = Object.keys(byCat).filter(c => c !== 'Odpisy' && c !== 'Oprávky').sort();
    const tI = cats.reduce((s, c) => s + byCat[c].i, 0), tD = (byCat['Odpisy'] || { d: 0 }).d;
    document.getElementById('capex-heroes').innerHTML = [heroCard('Investice', CZKshort(tI), 'Dlouhodobý majetek', 'glow-blue', tI), heroCard('Odpisy', CZKshort(tD), 'Náklady na odpisy', 'glow-amber', -tD), heroCard('Čistá hodnota', CZKshort(tI - tD), 'Investice − odpisy', 'glow-green', tI - tD)].join('');
    mc('c-capex-bar', { type: 'bar', data: { labels: cats, datasets: [{ label: 'Investice', data: cats.map(c => byCat[c].i), backgroundColor: aC(COLORS.blue, 0.55), borderRadius: 3 }, { label: 'Odpisy', data: cats.map(c => byCat[c].d), backgroundColor: aC(COLORS.amber, 0.55), borderRadius: 3 }] }, options: bO() });
    const per = Object.keys(byP).sort();
    mc('c-capex-monthly', { type: 'bar', data: { labels: per.map(fmtPS), datasets: [{ label: 'Investice', data: per.map(p => byP[p].i), backgroundColor: aC(COLORS.blue, 0.5), borderRadius: 2 }, { label: 'Odpisy', data: per.map(p => byP[p].d), type: 'line', borderColor: COLORS.amber, tension: .3, pointRadius: 2 }] }, options: bO() });
}

// ── HR ──
function renderHR(f) {
    const rows = D.hr.filter(r => mY(r.period, f.year) && mQp(r.period, f.quarter) && mR(r, f.region) && mC(r, f.cc));
    const byP = {}; let tFT = 0, tPT = 0, tDPP = 0;
    rows.forEach(r => { if (!byP[r.period]) byP[r.period] = { hc: 0, fte: 0, cost: 0, gross: 0, bon: 0, cnt: 0 }; byP[r.period].hc += r.headcount; byP[r.period].fte += r.effective_fte; byP[r.period].cost += r.employer_cost; byP[r.period].gross += r.gross_total; byP[r.period].bon += r.bonuses; byP[r.period].cnt++; tFT += r.fte_full_time; tPT += r.fte_part_time; tDPP += r.fte_contractors });
    const per = Object.keys(byP).sort(), lp = per[per.length - 1], last = byP[lp] || { hc: 0, fte: 0, cost: 0, gross: 0 }, tC = Object.values(byP).reduce((s, p) => s + p.cost, 0);
    document.getElementById('hr-heroes').innerHTML = [heroCard('Zaměstnanců', last.hc.toString(), lp ? fmtP(lp) : '', 'glow-violet'), heroCard('FTE', last.fte.toFixed(1), 'Přepočtený úvazek', 'glow-indigo'), heroCard('Celk. náklady', CZKshort(tC), 'Za období', 'glow-green', tC), heroCard('Prům. hrubá', last.hc ? CZKshort(last.gross / last.hc) : '0 Kč', 'Poslední měsíc', 'glow-amber')].join('');
    mc('c-hr-fte', { type: 'bar', data: { labels: per.map(fmtPS), datasets: [{ label: 'Náklady zaměstnavatele', data: per.map(p => byP[p].cost), backgroundColor: aC(COLORS.indigo, 0.5), borderRadius: 2, yAxisID: 'y' }, { label: 'Efektivní FTE', data: per.map(p => byP[p].fte), type: 'line', borderColor: COLORS.green, tension: .3, pointRadius: 2, yAxisID: 'y1' }] }, options: { ...bO(), scales: { y: { position: 'left', ticks: { color: '#6b7280', font: { size: 10 }, callback: v => CZKshort(v) }, grid: { color: 'rgba(75,85,99,0.12)' } }, y1: { position: 'right', ticks: { color: '#10b981', font: { size: 10 } }, grid: { drawOnChartArea: false } }, x: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(75,85,99,0.12)' } } } } });
    mc('c-hr-salary', { type: 'line', data: { labels: per.map(fmtPS), datasets: [{ label: 'Prům. hrubá mzda', data: per.map(p => byP[p].hc ? byP[p].gross / byP[p].hc : 0), borderColor: COLORS.indigo, tension: .3, yAxisID: 'y', pointRadius: 2 }, { label: 'Podíl bonusů (%)', data: per.map(p => byP[p].gross ? byP[p].bon / byP[p].gross * 100 : 0), borderColor: COLORS.amber, tension: .3, yAxisID: 'y1', pointRadius: 2 }] }, options: { ...bO(), scales: { y: { position: 'left', ticks: { color: '#6b7280', font: { size: 10 }, callback: v => CZKshort(v) }, grid: { color: 'rgba(75,85,99,0.12)' } }, y1: pctScale, x: { ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(75,85,99,0.12)' } } } } });
    const np = per.length || 1;
    mc('c-hr-contracts', { type: 'doughnut', data: { labels: ['Plný úvazek', 'Částečný', 'DPP'], datasets: [{ data: [tFT / np, tPT / np, tDPP / np].map(Math.round), backgroundColor: [COLORS.indigo, COLORS.amber, COLORS.rose], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { labels: { color: '#9ca3af', font: { size: 11, family: 'Inter' }, padding: 10, usePointStyle: true, pointStyle: 'circle' } } } } });
}

// ── SALES ──
function renderSales(f) {
    const rows = D.sales.filter(r => mY(r.period, f.year) && mQp(r.period, f.quarter) && mR(r, f.region) && mCat(r, f.category));
    const byP = {}, byCat = {}, byReg = {}, byCh = {}; let tQ = 0, tR = 0, tC = 0;
    rows.forEach(r => { if (!byP[r.period]) byP[r.period] = { rev: 0, qty: 0, cogs: 0 }; byP[r.period].rev += r.revenue; byP[r.period].qty += r.quantity; byP[r.period].cogs += r.cogs; byCat[r.product_category] = (byCat[r.product_category] || 0) + r.revenue; byReg[r.region] = (byReg[r.region] || 0) + r.revenue; byCh[r.channel] = (byCh[r.channel] || 0) + r.revenue; tQ += r.quantity; tR += r.revenue; tC += r.cogs });
    const gm = tR ? (tR - tC) / tR * 100 : 0;
    document.getElementById('sales-heroes').innerHTML = [heroCard('Celkové tržby', CZKshort(tR), f.year === 'all' ? 'Celé období' : 'Rok ' + f.year, 'glow-green', tR), heroCard('Prodané kusy', tQ.toLocaleString('cs-CZ'), 'Objem', 'glow-blue'), heroCard('Hrubá marže', pct(gm), '(Tržby−COGS)/Tržby', 'glow-violet', gm), heroCard('Prům. cena', tQ ? CZKshort(tR / tQ) : '0 Kč', 'Na jednotku', 'glow-amber')].join('');
    const per = Object.keys(byP).sort();
    mc('c-sales-trend', { type: 'line', data: { labels: per.map(fmtPS), datasets: [{ label: 'Tržby', data: per.map(p => byP[p].rev), borderColor: COLORS.green, backgroundColor: aC(COLORS.green, 0.1), tension: .3, fill: true, pointRadius: 2 }] }, options: bO() });
    const ck = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    mc('c-sales-cat', { type: 'bar', data: { labels: ck, datasets: [{ label: 'Tržby', data: ck.map(c => byCat[c]), backgroundColor: CA.slice(0, ck.length), borderRadius: 3 }] }, options: { ...bO(), indexAxis: 'y', plugins: { ...bO().plugins, legend: { display: false } } } });
    const rk = Object.entries(byReg).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    mc('c-sales-region', { type: 'bar', data: { labels: rk, datasets: [{ label: 'Tržby', data: rk.map(r => byReg[r]), backgroundColor: aC(COLORS.indigo, 0.55), borderRadius: 3 }] }, options: { ...bO(), plugins: { ...bO().plugins, legend: { display: false } } } });
    const chk = Object.entries(byCh).sort((a, b) => b[1] - a[1]).map(e => e[0]);
    mc('c-sales-channel', { type: 'doughnut', data: { labels: chk, datasets: [{ data: chk.map(c => byCh[c]), backgroundColor: CA.slice(0, chk.length), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { labels: { color: '#9ca3af', font: { size: 11, family: 'Inter' }, padding: 10, usePointStyle: true, pointStyle: 'circle' } }, tooltip: { callbacks: { label: ctx => ctx.label + ': ' + CZK.format(Math.round(ctx.parsed)) } } } } });
}

// ── VARIANCE ──
let varSortCol = null, varSortAsc = true;
function renderVariance(f) {
    const groupBy = document.getElementById('var-groupby').value;
    // Use detail data for drilldown
    const detail = D.variance_detail.filter(r => mY(r.period, f.year) && mQp(r.period, f.quarter) && mR(r, f.region) && mCat(r, f.category));
    // Also filter legacy variance for hero cards
    const rows = D.variance.filter(r => mY(r.period, f.year) && mQp(r.period, f.quarter) && mCat(r, f.category));

    // Hero cards from aggregated variance
    const byCatH = {};
    rows.forEach(r => { if (!byCatH[r.product_category]) byCatH[r.product_category] = { vol: 0, price: 0, cost: 0, total: 0 }; byCatH[r.product_category].vol += r.volume_variance; byCatH[r.product_category].price += r.price_variance; byCatH[r.product_category].cost += r.cost_variance; byCatH[r.product_category].total += r.total_variance });
    const tVol = Object.values(byCatH).reduce((s, c) => s + c.vol, 0), tPri = Object.values(byCatH).reduce((s, c) => s + c.price, 0), tCos = Object.values(byCatH).reduce((s, c) => s + c.cost, 0), tTot = Object.values(byCatH).reduce((s, c) => s + c.total, 0);
    const fav = v => v >= 0 ? '<span class="up">Příznivé</span>' : '<span class="down">Nepříznivé</span>';
    document.getElementById('var-heroes').innerHTML = [heroCard('Objemová', CZKshort(tVol), fav(tVol), 'glow-green', tVol), heroCard('Cenová', CZKshort(tPri), fav(tPri), 'glow-indigo', tPri), heroCard('Nákladová', CZKshort(tCos), fav(-tCos), 'glow-rose', -tCos), heroCard('Celková', CZKshort(tTot), fav(tTot), 'glow-violet', tTot)].join('');

    // Group detail data by selected dimension
    const grouped = {};
    detail.forEach(r => {
        let key;
        if (groupBy === 'period') key = r.period;
        else if (groupBy === 'quarter') key = r.quarter;
        else key = r[groupBy] || 'Neznámý';
        if (!grouped[key]) grouped[key] = { vol: 0, price: 0, cost: 0, total: 0, actRev: 0, planRev: 0, actQty: 0, planQty: 0 };
        grouped[key].vol += r.volume_variance; grouped[key].price += r.price_variance; grouped[key].cost += r.cost_variance;
        grouped[key].total += r.total_variance; grouped[key].actRev += r.actual_revenue; grouped[key].planRev += r.plan_revenue;
        grouped[key].actQty += r.actual_qty; grouped[key].planQty += r.plan_qty;
    });
    let gKeys = Object.keys(grouped).sort();
    if (groupBy === 'period') gKeys.sort();

    // Decomposition chart
    mc('c-var-decomp', {
        type: 'bar', data: {
            labels: gKeys.map(k => groupBy === 'period' ? fmtPS(k) : k), datasets: [
                { label: 'Objemová', data: gKeys.map(k => grouped[k].vol), backgroundColor: aC(COLORS.green, 0.6), borderRadius: 2 },
                { label: 'Cenová', data: gKeys.map(k => grouped[k].price), backgroundColor: aC(COLORS.indigo, 0.6), borderRadius: 2 },
                { label: 'Nákladová', data: gKeys.map(k => grouped[k].cost), backgroundColor: aC(COLORS.rose, 0.6), borderRadius: 2 }
            ]
        }, options: { ...bO(), scales: { x: { stacked: true, ticks: { color: '#6b7280', font: { size: 10 } }, grid: { color: 'rgba(75,85,99,0.12)' } }, y: { stacked: true, ticks: { color: '#6b7280', font: { size: 10 }, callback: v => CZKshort(v) }, grid: { color: 'rgba(75,85,99,0.12)' } } } }
    });

    // Plan vs Actual trend (by period regardless of groupBy)
    const byPer = {};
    detail.forEach(r => { if (!byPer[r.period]) byPer[r.period] = { plan: 0, act: 0 }; byPer[r.period].plan += r.plan_revenue; byPer[r.period].act += r.actual_revenue });
    const per = Object.keys(byPer).sort();
    mc('c-var-monthly', {
        type: 'line', data: {
            labels: per.map(fmtPS), datasets: [
                { label: 'Skutečnost', data: per.map(p => byPer[p].act), borderColor: COLORS.green, backgroundColor: aC(COLORS.green, 0.1), tension: .3, fill: true, pointRadius: 2 },
                { label: 'Plán (předchozí rok)', data: per.map(p => byPer[p].plan), borderColor: COLORS.blue, borderDash: [5, 3], tension: .3, pointRadius: 2 }
            ]
        }, options: bO()
    });

    // Heatmap: rows = dimension values, cols = periods
    renderHeatmap(detail, groupBy, per);

    // Detail table
    renderVarTable(gKeys, grouped, groupBy);
}

function renderHeatmap(detail, groupBy, allPeriods) {
    const hm = document.getElementById('var-heatmap');
    if (!allPeriods.length || groupBy === 'period') { hm.innerHTML = '<p style="color:var(--text-muted);font-size:12px;text-align:center;padding:20px">Vyberte jinou dimenzi pro zobrazení heatmapy</p>'; return }
    // Build matrix: rows=dimension values, cols=periods
    const matrix = {};
    detail.forEach(r => {
        const dim = r[groupBy] || 'Neznámý';
        if (!matrix[dim]) matrix[dim] = {};
        if (!matrix[dim][r.period]) matrix[dim][r.period] = 0;
        matrix[dim][r.period] += r.total_variance;
    });
    const dims = Object.keys(matrix).sort().slice(0, 15); // max 15 rows
    const periods = allPeriods;
    // Find min/max for color scale
    let mn = 0, mx = 0;
    dims.forEach(d => periods.forEach(p => { const v = matrix[d]?.[p] || 0; if (v < mn) mn = v; if (v > mx) mx = v }));
    const range = Math.max(Math.abs(mn), Math.abs(mx)) || 1;

    let html = '<div class="heatmap-header">' + periods.map(p => '<span>' + fmtPS(p) + '</span>').join('') + '</div>';
    dims.forEach(d => {
        html += '<div class="heatmap-row"><div class="heatmap-label" title="' + d + '">' + d + '</div>';
        periods.forEach(p => {
            const v = matrix[d]?.[p] || 0;
            const intensity = Math.min(Math.abs(v) / range, 1);
            let bg;
            if (v > 0) bg = `rgba(16,185,129,${0.15 + intensity * 0.7})`;
            else if (v < 0) bg = `rgba(239,68,68,${0.15 + intensity * 0.7})`;
            else bg = 'rgba(75,85,99,0.15)';
            const txt = Math.abs(v) > range * 0.1 ? CZKshort(v) : '';
            html += `<div class="heatmap-cell" style="background:${bg}" title="${d} | ${fmtPS(p)}: ${CZK.format(Math.round(v))}">${txt}</div>`;
        });
        html += '</div>';
    });
    hm.innerHTML = html;
}

function renderVarTable(keys, grouped, groupBy) {
    const cols = [
        { key: 'dim', label: groupBy === 'period' ? 'Období' : groupBy === 'quarter' ? 'Kvartál' : groupBy === 'product_category' ? 'Kategorie' : groupBy === 'region' ? 'Region' : groupBy === 'channel' ? 'Kanál' : 'Pobočka', fmt: v => groupBy === 'period' ? fmtP(v) : v },
        { key: 'actRev', label: 'Skut. tržby', fmt: CZKshort, numeric: true },
        { key: 'planRev', label: 'Plán tržby', fmt: CZKshort, numeric: true },
        { key: 'total', label: 'Celková odch.', fmt: CZKshort, numeric: true, colored: true },
        { key: 'pct', label: 'Odch. %', fmt: v => pct(v), numeric: true, colored: true },
        { key: 'vol', label: 'Objemová', fmt: CZKshort, numeric: true, colored: true },
        { key: 'price', label: 'Cenová', fmt: CZKshort, numeric: true, colored: true },
        { key: 'cost', label: 'Nákladová', fmt: CZKshort, numeric: true, colored: true },
    ];
    // Prepare data rows
    let dataRows = keys.map(k => { const g = grouped[k]; return { dim: k, actRev: g.actRev, planRev: g.planRev, total: g.total, pct: g.planRev ? g.total / g.planRev * 100 : 0, vol: g.vol, price: g.price, cost: g.cost } });
    // Sort
    if (varSortCol !== null) { const c = cols[varSortCol]; dataRows.sort((a, b) => { const va = c.numeric ? a[c.key] : String(a[c.key]), vb = c.numeric ? b[c.key] : String(b[c.key]); return varSortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1) }) }
    // Render
    let html = '<thead><tr>';
    cols.forEach((c, i) => { const arrow = varSortCol === i ? (varSortAsc ? ' ▲' : ' ▼') : ''; html += `<th data-col="${i}">${c.label}<span class="sort-arrow">${arrow}</span></th>` });
    html += '</tr></thead><tbody>';
    dataRows.forEach(r => {
        html += '<tr>';
        cols.forEach(c => {
            const v = r[c.key];
            let cls = ''; if (c.colored) cls = v >= 0 ? 'positive' : 'negative';
            html += `<td class="${cls}" style="${c.numeric ? 'text-align:right' : ''}">${c.fmt(v)}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody>';
    const tbl = document.getElementById('var-table');
    tbl.innerHTML = html;
    // Sortable headers
    tbl.querySelectorAll('th').forEach(th => {
        th.addEventListener('click', () => { const ci = parseInt(th.dataset.col); if (varSortCol === ci) varSortAsc = !varSortAsc; else { varSortCol = ci; varSortAsc = true } renderVariance(gF()) });
    });
}

// Init
renderAll();
[elY, elQ, elR, elC, elCat].forEach(el => el.addEventListener('change', renderAll));
document.getElementById('var-groupby').addEventListener('change', () => renderVariance(gF()));
