"""
build_data.py – Reads all CSV files from financial_dataset/ and generates data.js
===================================================================================
Run: python dashboard/build_data.py
Output: dashboard/data.js (overwritten)
"""

import csv
import json
import os
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_DIR = os.path.join(BASE_DIR, "financial_dataset")
OUT_FILE = os.path.join(BASE_DIR, "dashboard", "data.js")


def read_csv(filename):
    """Read a CSV file and return list of dicts, handling BOM."""
    path = os.path.join(CSV_DIR, filename)
    rows = []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def safe_float(val, default=0.0):
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def safe_int(val, default=0):
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


def period_from_date(date_str):
    """Extract YYYY-MM from a date string like 2025-01-15."""
    if date_str and len(date_str) >= 7:
        return date_str[:7]
    return None


def main():
    print("Loading CSVs...")

    # ── Dimensions ──
    accounts = {r["ucet_cislo"]: r for r in read_csv("dim_ucty.csv")}
    cost_centers = {r["stredisko_id"]: r for r in read_csv("dim_strediska.csv")}
    branches = {r["pobocka_id"]: r for r in read_csv("dim_pobocky.csv")}
    regions = {r["region_id"]: r for r in read_csv("dim_regiony.csv")}
    products = {r["produkt_id"]: r for r in read_csv("dim_produkty.csv")}
    employees = {r["zamestnanec_id"]: r for r in read_csv("dim_zamestnanci.csv")}
    profit_centers = {r["profit_centrum_id"]: r for r in read_csv("dim_profit_centra.csv")}

    # ── Facts ──
    transactions = read_csv("fact_transakce.csv")
    budget = read_csv("fact_budget.csv")
    sales = read_csv("fact_prodeje.csv")
    payroll = read_csv("fact_mzdy.csv")
    purchases = read_csv("fact_nakupy.csv")
    production = read_csv("fact_vyrobni_zakazky.csv")
    cashflow = read_csv("fact_cashflow.csv")

    # ── Build lookup helpers ──
    def get_region_for_branch(branch_id):
        br = branches.get(branch_id, {})
        reg_id = br.get("region_id", "")
        return regions.get(reg_id, {}).get("region_nazev", "Neznámý")

    def get_region_for_cc(cc_id):
        cc = cost_centers.get(cc_id, {})
        return get_region_for_branch(cc.get("pobocka_id", ""))

    # Collect all unique filter values
    all_years = set()
    all_cc_ids = set()
    all_regions = set()
    all_categories = set()

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 1. KPIs (from transactions)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print("  Computing KPIs...")
    # Per period: revenue, cogs, opex, depreciation, receivables, payables
    kpi_data = defaultdict(lambda: {
        "revenue": 0, "cogs": 0, "opex": 0, "depreciation": 0,
        "total_expenses": 0, "receivables": 0, "payables": 0,
        "asset_debit": 0, "asset_credit": 0,
        "equity_credit": 0, "equity_debit": 0
    })

    for t in transactions:
        if t.get("stav") != "Zaúčtováno":
            continue
        period = period_from_date(t.get("datum"))
        if not period:
            continue
        amount = safe_float(t.get("castka_czk"))
        debit_acc = accounts.get(t.get("ucet_md"), {})
        credit_acc = accounts.get(t.get("ucet_dal"), {})
        year = period[:4]
        all_years.add(year)

        cc_id = t.get("stredisko_id", "")
        if cc_id:
            all_cc_ids.add(cc_id)

        # Revenue: credit to Výnosy accounts
        if credit_acc.get("typ") == "Výnosy":
            kpi_data[period]["revenue"] += amount

        # COGS: debit to Spotřebované nákupy
        if debit_acc.get("skupina", "").startswith("Spotřebované"):
            kpi_data[period]["cogs"] += amount

        # OPEX: all Náklady except Odpisy and Daně z příjmů
        if debit_acc.get("typ") == "Náklady":
            skupina = debit_acc.get("skupina", "")
            kpi_data[period]["total_expenses"] += amount
            if "Odpisy" not in skupina:
                if "Daně z příjmů" not in skupina:
                    kpi_data[period]["opex"] += amount
            if "Odpisy" in skupina:
                kpi_data[period]["depreciation"] += amount

        # Receivables (net: debit increases, credit decreases)
        if "Pohledávky" in debit_acc.get("skupina", ""):
            kpi_data[period]["receivables"] += amount
        if "Pohledávky" in credit_acc.get("skupina", ""):
            kpi_data[period]["receivables"] -= amount

        # Payables (net: credit increases, debit decreases)
        if "Závazky" in credit_acc.get("skupina", "") and "Dlouhodobé" not in credit_acc.get("skupina", ""):
            kpi_data[period]["payables"] += amount
        if "Závazky" in debit_acc.get("skupina", "") and "Dlouhodobé" not in debit_acc.get("skupina", ""):
            kpi_data[period]["payables"] -= amount

        # Assets (debit = increase, credit = decrease)
        if debit_acc.get("typ") == "Aktiva":
            kpi_data[period]["asset_debit"] += amount
        if credit_acc.get("typ") == "Aktiva":
            kpi_data[period]["asset_credit"] += amount

        # Equity (credit = increase, debit = decrease)
        eq_groups = ("Vlastní kapitál", "Fondy", "Výsledek hospodaření")
        if credit_acc.get("skupina", "") in eq_groups:
            kpi_data[period]["equity_credit"] += amount
        if debit_acc.get("skupina", "") in eq_groups:
            kpi_data[period]["equity_debit"] += amount

    # Build KPI output with cumulative balance sheet items
    kpi_periods = sorted(kpi_data.keys())
    kpis_output = []
    cumulative_assets = 0.0
    cumulative_equity = 0.0

    for p in kpi_periods:
        d = kpi_data[p]
        rev = d["revenue"]
        cogs = d["cogs"]
        opex = d["opex"]
        depr = d["depreciation"]
        total_exp = d["total_expenses"]
        gross_profit = rev - cogs
        ebitda = rev - opex
        ebit = ebitda - depr
        net_income = rev - total_exp

        # Running cumulative totals for balance sheet
        cumulative_assets += (d["asset_debit"] - d["asset_credit"])
        cumulative_equity += (d["equity_credit"] - d["equity_debit"])

        # Use absolute value for denominator, ensure minimum to avoid division spikes
        total_assets = max(abs(cumulative_assets), 1e6)
        total_equity = max(abs(cumulative_equity), 1e6)

        # Annualized ROA & ROE (monthly income * 12 / total balance)
        roa = net_income / total_assets * 12 * 100
        roe = net_income / total_equity * 12 * 100

        # Clamp to realistic range
        roa = max(-100, min(100, roa))
        roe = max(-100, min(100, roe))

        # DSO/DPO: use absolute value of net receivables/payables
        dso = round(abs(d["receivables"]) / (rev / 30), 1) if rev > 0 else 0
        dpo = round(abs(d["payables"]) / (opex / 30), 1) if opex > 0 else 0
        # Cap DSO/DPO at 120 days max for realism
        dso = min(dso, 120)
        dpo = min(dpo, 120)

        kpis_output.append({
            "period": p,
            "revenue": round(rev, 2),
            "cogs": round(cogs, 2),
            "gross_profit": round(gross_profit, 2),
            "gross_margin_pct": round(gross_profit / rev * 100, 2) if rev else 0,
            "ebitda": round(ebitda, 2),
            "ebitda_margin_pct": round(ebitda / rev * 100, 2) if rev else 0,
            "ebit": round(ebit, 2),
            "net_income": round(net_income, 2),
            "depreciation": round(depr, 2),
            "dso_days": dso,
            "dpo_days": dpo,
            "roa_pct": round(roa, 2),
            "roe_pct": round(roe, 2),
        })

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Cashflow for burn rate (from fact_cashflow)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    cf_data = defaultdict(lambda: {"inflow": 0, "outflow": 0})
    for c in cashflow:
        if c.get("stav") != "Realizováno":
            continue
        period = period_from_date(c.get("datum"))
        if not period:
            continue
        amount = safe_float(c.get("castka"))
        smer = c.get("smer", "")
        if smer == "Příjem":
            cf_data[period]["inflow"] += abs(amount)
        elif smer == "Výdaj":
            cf_data[period]["outflow"] += abs(amount)

    # Merge cashflow into KPIs
    for k in kpis_output:
        p = k["period"]
        inflow = cf_data[p]["inflow"]
        outflow = cf_data[p]["outflow"]
        k["cash_inflow"] = round(inflow, 2)
        k["cash_outflow"] = round(outflow, 2)
        k["net_cashflow"] = round(inflow - outflow, 2)
        k["burn_rate"] = round(outflow, 2)

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 2. OPEX (from budget + accounts)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print("  Computing OPEX...")

    def opex_category(skupina):
        if "Služby" in skupina:
            return "Nájmy a služby"
        if "Spotřebované" in skupina:
            return "Energie a materiál"
        if "Osobní" in skupina:
            return "Personální náklady"
        if "provozní náklady" in skupina:
            return "Marketing a cestovné"
        if "Daně a poplatky" in skupina:
            return "Daně a poplatky"
        if "Finanční náklady" in skupina:
            return "Finanční náklady"
        return None

    opex_rows = []
    for b in budget:
        acc = accounts.get(b.get("ucet_cislo"), {})
        if acc.get("typ") != "Náklady":
            continue
        skupina = acc.get("skupina", "")
        if "Odpisy" in skupina or "Daně z příjmů" in skupina:
            continue
        cat = opex_category(skupina)
        if not cat:
            continue
        cc_id = b.get("stredisko_id", "")
        period = b.get("obdobi", "")
        region = get_region_for_cc(cc_id)
        all_cc_ids.add(cc_id)
        all_regions.add(region)
        all_years.add(period[:4] if len(period) >= 4 else "")

        opex_rows.append({
            "period": period,
            "cost_center_id": cc_id,
            "cost_center_name": cost_centers.get(cc_id, {}).get("stredisko_nazev", cc_id),
            "region": region,
            "category": cat,
            "planned": round(safe_float(b.get("plan")), 2),
            "actual": round(safe_float(b.get("skutecnost")), 2),
            "variance": round(safe_float(b.get("odchylka")), 2),
            "variance_pct": round(safe_float(b.get("odchylka_pct")), 2),
        })

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 3. CAPEX (from transactions on class 0 + depreciation)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print("  Computing CAPEX...")
    capex_data = defaultdict(lambda: {"investment": 0, "depreciation": 0, "accum_depr": 0})

    for t in transactions:
        if t.get("stav") != "Zaúčtováno":
            continue
        period = period_from_date(t.get("datum"))
        if not period:
            continue
        amount = safe_float(t.get("castka_czk"))
        debit_acc = accounts.get(t.get("ucet_md"), {})
        credit_acc = accounts.get(t.get("ucet_dal"), {})
        cc_id = t.get("stredisko_id", "")

        key = (period, cc_id)

        # Investment: debit to class 0 Aktiva (excluding Oprávky)
        if debit_acc.get("trida") == "0" and "Oprávky" not in debit_acc.get("skupina", ""):
            cat = "Hmotný majetek"
            if "nehmotný" in debit_acc.get("skupina", "").lower():
                cat = "Nehmotný majetek"
            elif "finanční" in debit_acc.get("skupina", "").lower():
                cat = "Finanční majetek"
            capex_data[(period, cc_id, cat)]["investment"] += amount

        # Depreciation expense
        if "Odpisy" in debit_acc.get("skupina", ""):
            capex_data[(period, cc_id, "Odpisy")]["depreciation"] += amount

        # Accumulated depreciation
        if "Oprávky" in credit_acc.get("skupina", ""):
            capex_data[(period, cc_id, "Oprávky")]["accum_depr"] += amount

    capex_rows = []
    for (period, cc_id, cat), d in capex_data.items():
        capex_rows.append({
            "period": period,
            "cost_center_id": cc_id,
            "cost_center_name": cost_centers.get(cc_id, {}).get("stredisko_nazev", cc_id),
            "region": get_region_for_cc(cc_id),
            "asset_category": cat,
            "investment": round(d["investment"], 2),
            "depreciation": round(d["depreciation"], 2),
            "accum_depreciation": round(d["accum_depr"], 2),
        })

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 4. HR Budget (from payroll + employees)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print("  Computing HR Budget...")
    hr_agg = defaultdict(lambda: {
        "headcount": set(), "full_time": set(), "part_time": set(), "dpp": set(),
        "base_salary": 0, "bonuses": 0, "gross_total": 0,
        "soc_employer": 0, "health_employer": 0,
        "income_tax": 0, "net_salary": 0, "employer_cost": 0
    })

    for p in payroll:
        period = p.get("obdobi", "")
        cc_id = p.get("stredisko_id", "")
        emp_id = p.get("zamestnanec_id", "")
        emp = employees.get(emp_id, {})
        contract = emp.get("typ_uvazku", "")

        key = (period, cc_id)
        all_years.add(period[:4] if len(period) >= 4 else "")
        all_cc_ids.add(cc_id)

        hr_agg[key]["headcount"].add(emp_id)
        if contract == "Plný úvazek":
            hr_agg[key]["full_time"].add(emp_id)
        elif contract == "Částečný úvazek":
            hr_agg[key]["part_time"].add(emp_id)
        elif contract == "DPP":
            hr_agg[key]["dpp"].add(emp_id)

        hr_agg[key]["base_salary"] += safe_float(p.get("zakladni_mzda"))
        hr_agg[key]["bonuses"] += safe_float(p.get("odmeny"))
        hr_agg[key]["gross_total"] += safe_float(p.get("hruba_mzda_celkem"))
        hr_agg[key]["soc_employer"] += safe_float(p.get("soc_pojisteni_firma"))
        hr_agg[key]["health_employer"] += safe_float(p.get("zdr_pojisteni_firma"))
        hr_agg[key]["income_tax"] += safe_float(p.get("dan_z_prijmu"))
        hr_agg[key]["net_salary"] += safe_float(p.get("cista_mzda"))
        hr_agg[key]["employer_cost"] += safe_float(p.get("celkove_naklady_firma"))

    hr_rows = []
    for (period, cc_id), d in hr_agg.items():
        hc = len(d["headcount"])
        ft = len(d["full_time"])
        pt = len(d["part_time"])
        dpp = len(d["dpp"])
        fte = ft + pt * 0.5 + dpp * 0.2

        hr_rows.append({
            "period": period,
            "cost_center_id": cc_id,
            "cost_center_name": cost_centers.get(cc_id, {}).get("stredisko_nazev", cc_id),
            "region": get_region_for_cc(cc_id),
            "headcount": hc,
            "fte_full_time": ft,
            "fte_part_time": pt,
            "fte_contractors": dpp,
            "effective_fte": round(fte, 1),
            "base_salary": round(d["base_salary"], 2),
            "bonuses": round(d["bonuses"], 2),
            "gross_total": round(d["gross_total"], 2),
            "soc_employer": round(d["soc_employer"], 2),
            "health_employer": round(d["health_employer"], 2),
            "employer_cost": round(d["employer_cost"], 2),
            "avg_gross": round(d["gross_total"] / hc, 2) if hc else 0,
            "bonus_ratio_pct": round(d["bonuses"] / d["gross_total"] * 100, 2) if d["gross_total"] else 0,
        })

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 5. Sales Forecast (from sales)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print("  Computing Sales...")
    sales_agg = defaultdict(lambda: {
        "invoices": 0, "qty": 0, "revenue": 0, "cogs": 0,
        "discount_sum": 0, "discount_count": 0
    })

    for s in sales:
        if s.get("stav_platby") == "Storno":
            continue
        period = period_from_date(s.get("datum"))
        if not period:
            continue
        prod = products.get(s.get("produkt_id"), {})
        category = prod.get("kategorie", "Neznámá")
        branch_id = s.get("pobocka_id", "")
        region = get_region_for_branch(branch_id)
        channel = s.get("kanal", "Neznámý")

        all_categories.add(category)
        all_regions.add(region)
        all_years.add(period[:4])

        key = (period, category, region, channel)
        sales_agg[key]["invoices"] += 1
        sales_agg[key]["qty"] += safe_int(s.get("mnozstvi"))
        sales_agg[key]["revenue"] += safe_float(s.get("celkem_bez_dph"))
        sales_agg[key]["cogs"] += safe_float(s.get("nakladova_cena_celkem"))
        sales_agg[key]["discount_sum"] += safe_float(s.get("sleva_pct"))
        sales_agg[key]["discount_count"] += 1

    sales_rows = []
    for (period, category, region, channel), d in sales_agg.items():
        rev = d["revenue"]
        cogs = d["cogs"]
        sales_rows.append({
            "period": period,
            "product_category": category,
            "region": region,
            "channel": channel,
            "num_invoices": d["invoices"],
            "quantity": d["qty"],
            "revenue": round(rev, 2),
            "cogs": round(cogs, 2),
            "gross_profit": round(rev - cogs, 2),
            "gross_margin_pct": round((rev - cogs) / rev * 100, 2) if rev else 0,
            "avg_price": round(rev / d["qty"], 2) if d["qty"] else 0,
            "avg_discount_pct": round(d["discount_sum"] / d["discount_count"], 2) if d["discount_count"] else 0,
        })

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # 6. Variance Analysis (actual vs prior year)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    print("  Computing Variance...")
    # Aggregate sales by category+month
    var_agg = defaultdict(lambda: {"qty": 0, "revenue": 0, "cogs": 0})
    for s in sales:
        if s.get("stav_platby") == "Storno":
            continue
        period = period_from_date(s.get("datum"))
        if not period:
            continue
        prod = products.get(s.get("produkt_id"), {})
        category = prod.get("kategorie", "Neznámá")
        var_agg[(period, category)]["qty"] += safe_int(s.get("mnozstvi"))
        var_agg[(period, category)]["revenue"] += safe_float(s.get("celkem_bez_dph"))
        var_agg[(period, category)]["cogs"] += safe_float(s.get("nakladova_cena_celkem"))

    variance_rows = []
    for (period, category), d in var_agg.items():
        year = int(period[:4])
        month = period[5:7]
        prev_period = f"{year - 1}-{month}"
        prev = var_agg.get((prev_period, category))
        if not prev:
            continue

        act_qty = d["qty"]
        act_rev = d["revenue"]
        act_cogs = d["cogs"]
        plan_qty = prev["qty"]
        plan_rev = prev["revenue"]
        plan_cogs = prev["cogs"]
        plan_price = plan_rev / plan_qty if plan_qty else 0
        act_price = act_rev / act_qty if act_qty else 0
        plan_cost_unit = plan_cogs / plan_qty if plan_qty else 0

        volume_var = (act_qty - plan_qty) * plan_price
        price_var = (act_price - plan_price) * act_qty
        cost_var = act_cogs - (plan_cost_unit * act_qty)

        variance_rows.append({
            "period": period,
            "product_category": category,
            "actual_qty": act_qty,
            "actual_revenue": round(act_rev, 2),
            "actual_cogs": round(act_cogs, 2),
            "plan_qty": plan_qty,
            "plan_revenue": round(plan_rev, 2),
            "plan_cogs": round(plan_cogs, 2),
            "volume_variance": round(volume_var, 2),
            "price_variance": round(price_var, 2),
            "cost_variance": round(cost_var, 2),
            "total_variance": round(act_rev - plan_rev, 2),
        })

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Build filters
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    cc_list = []
    for cc_id in sorted(all_cc_ids):
        cc = cost_centers.get(cc_id, {})
        cc_list.append({"id": cc_id, "name": cc.get("stredisko_nazev", cc_id)})

    filters = {
        "years": sorted(y for y in all_years if y),
        "cost_centers": cc_list,
        "regions": sorted(r for r in all_regions if r),
        "categories": sorted(c for c in all_categories if c),
    }

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Output
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    output = {
        "filters": filters,
        "kpis": kpis_output,
        "opex": opex_rows,
        "capex": capex_rows,
        "hr": hr_rows,
        "sales": sales_rows,
        "variance": variance_rows,
    }

    js_content = "// Auto-generated by build_data.py – do not edit manually\n"
    js_content += f"const FINANCIAL_DATA = {json.dumps(output, ensure_ascii=False, indent=2)};\n"

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"\n✅ Generated {OUT_FILE}")
    print(f"   KPIs:     {len(kpis_output)} periods")
    print(f"   OPEX:     {len(opex_rows)} rows")
    print(f"   CAPEX:    {len(capex_rows)} rows")
    print(f"   HR:       {len(hr_rows)} rows")
    print(f"   Sales:    {len(sales_rows)} rows")
    print(f"   Variance: {len(variance_rows)} rows")
    print(f"   Filters:  {len(filters['years'])} years, {len(filters['cost_centers'])} CC, {len(filters['regions'])} regions, {len(filters['categories'])} categories")


if __name__ == "__main__":
    main()
