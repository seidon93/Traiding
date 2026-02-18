#!/usr/bin/env python3
"""Quick diagnostic: compute KPIs from fact_transakce.csv using different approaches."""
import csv, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
accts = {r['ucet_cislo']: r for r in csv.DictReader(open('financial_dataset/dim_ucty.csv', encoding='utf-8-sig'))}

# Approach: single-sided with cross-type filter
# Revenue = credit to Výnosy where MD is NOT Výnosy/Závěrkové/Podrozvahové
# Expenses = debit to Náklady where DAL is NOT Náklady/Závěrkové/Podrozvahové
from collections import defaultdict
kpi: defaultdict[str, dict[str, float]] = defaultdict(lambda: {
    "rev": 0.0, "cogs": 0.0, "opex": 0.0, "depr": 0.0, "total_exp": 0.0,
    "recv_d": 0.0, "recv_c": 0.0, "pay_d": 0.0, "pay_c": 0.0,
    "asset_d": 0.0, "asset_c": 0.0})

skip_types = {'Závěrkové', 'Podrozvahové'}
n = 0
for t in csv.DictReader(open('financial_dataset/fact_transakce.csv', encoding='utf-8-sig')):
    if t.get('stav') != 'Zaúčtováno':
        continue
    period = t['datum'][:7]
    da = accts.get(t.get('ucet_md', ''), {})
    ca = accts.get(t.get('ucet_dal', ''), {})
    dt = da.get('typ', ''); ct = ca.get('typ', '')
    # Skip if either side is closing/off-balance
    if dt in skip_types or ct in skip_types:
        continue
    amt = float(t.get('castka_czk', 0) or 0)
    ds = da.get('skupina', ''); cs = ca.get('skupina', '')
    d = kpi[period]
    
    # Revenue: DAL = Výnosy and MD ≠ Výnosy  (exclude P&L internal transfers)
    if ct == 'Výnosy' and dt != 'Výnosy':
        d["rev"] += amt
    
    # Expenses: MD = Náklady and DAL ≠ Náklady
    if dt == 'Náklady' and ct != 'Náklady':
        d["total_exp"] += amt
        if ds.startswith('50 '):
            d["cogs"] += amt
        elif 'Odpisy' in ds:
            d["depr"] += amt
        elif 'Daně z příjmů' not in ds:
            d["opex"] += amt
    
    # Receivables
    if ds.startswith('31 ') or 'Pohledávky' in ds:
        d["recv_d"] += amt
    if cs.startswith('31 ') or 'Pohledávky' in cs:
        d["recv_c"] += amt
    
    # Payables (short-term)
    if (cs.startswith('32 ') or 'Závazky' in cs) and 'DL' not in cs:
        d["pay_c"] += amt
    if (ds.startswith('32 ') or 'Závazky' in ds) and 'DL' not in ds:
        d["pay_d"] += amt
    
    # Assets / Equity
    if dt == 'Aktiva': d["asset_d"] += amt
    if ct == 'Aktiva': d["asset_c"] += amt
    
    n += 1

print(f"Processed {n:,} transactions")
print(f"\n{'Period':<10} {'Revenue':>15} {'COGS':>12} {'OPEX':>12} {'EBITDA':>15} {'GM%':>7} {'EM%':>7}")
print("-" * 82)

cum_recv = 0; cum_pay = 0; cum_assets = 0
for p in list(sorted(kpi.keys()))[:6]:  # first 6 months
    d = kpi[p]
    rev = d["rev"]
    cogs = d["cogs"]
    opex = d["opex"]
    gp = rev - cogs
    ebitda = rev - cogs - opex
    gm = gp / rev * 100 if rev else 0
    em = ebitda / rev * 100 if rev else 0
    
    cum_recv += d["recv_d"] - d["recv_c"]
    cum_pay += d["pay_c"] - d["pay_d"]
    cum_assets += d["asset_d"] - d["asset_c"]
    
    daily_rev = rev / 30
    dso = cum_recv / daily_rev if daily_rev > 0 else 0
    dpo = cum_pay / (cogs / 30) if cogs > 0 else 0
    
    print(f"{p:<10} {rev:>15,.0f} {cogs:>12,.0f} {opex:>12,.0f} {ebitda:>15,.0f} {gm:>6.1f}% {em:>6.1f}%")
    print(f"           DSO={max(5,min(90,dso)):.0f}d  DPO={max(5,min(90,dpo)):.0f}d  CumRecv={cum_recv:,.0f}  CumPay={cum_pay:,.0f}")
