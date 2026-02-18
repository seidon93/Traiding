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


# helper for reading CSV with BOM handling and robust column name handling
def read_csv_to_dicts(filename, key_col):
    """
    Reads a CSV file into a dictionary where keys are from key_col.
    Handles BOM, strips whitespace from headers, and provides robust key_col lookup.
    """
    path = os.path.join(CSV_DIR, filename)
    data_map = {}
    try:
        with open(path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            # Normalize headers (strip whitespace)
            if reader.fieldnames:
                reader.fieldnames = [n.strip() for n in reader.fieldnames]
            
            # Verify key col exists, handle potential BOM prefix if utf-8-sig didn't catch it in header
            actual_key_col = key_col
            if key_col not in reader.fieldnames:
                potential = [k for k in reader.fieldnames if key_col in k]
                if potential:
                    print(f"Warning: Column '{key_col}' not found perfectly in {filename}, using '{potential[0]}'")
                    actual_key_col = potential[0]
                else:
                    print(f"Error: Key column '{key_col}' not found in {filename}. Available: {reader.fieldnames}")
                    return {} # Return empty if key_col is critical and not found
            
            for row in reader:
                val = row.get(actual_key_col)
                if val:
                    data_map[val] = row
        print(f"Loaded {len(data_map)} rows from {os.path.basename(path)}")
        return data_map
    except Exception as e:
        print(f"Error reading {path}: {e}")
        return {}

def read_csv_list(filename):
    """Read a CSV file and return list of dicts, handling BOM."""
    path = os.path.join(CSV_DIR, filename)
    rows = []
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        # Normalize headers (strip whitespace)
        if reader.fieldnames:
            reader.fieldnames = [n.strip() for n in reader.fieldnames]
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
    accounts = read_csv_to_dicts("dim_ucty.csv", "ucet_cislo")
    cost_centers = read_csv_to_dicts("dim_strediska.csv", "stredisko_id")
    branches = read_csv_to_dicts("dim_pobocky.csv", "pobocka_id")
    regions = read_csv_to_dicts("dim_regiony.csv", "region_id")
    products = read_csv_to_dicts("dim_produkty.csv", "produkt_id")
    employees = read_csv_to_dicts("dim_zamestnanci.csv", "zamestnanec_id")
    profit_centers = read_csv_to_dicts("dim_profit_centra.csv", "profit_centrum_id")

    # ── Facts ──
    transactions = read_csv_list("fact_transakce.csv")
    budget = read_csv_list("fact_budget.csv")
    sales = read_csv_list("fact_prodeje.csv")
    payroll = read_csv_list("fact_mzdy.csv")
    purchases = read_csv_list("fact_nakupy.csv")
    production = read_csv_list("fact_vyrobni_zakazky.csv")
    # cashflow = read_csv_list("fact_cashflow.csv") - Removed

    # ── Build lookup helpers ──
    def get_region_for_branch(branch_id):
        br = branches.get(branch_id, {})
        reg_id = br.get("region_id", "")
        return regions.get(reg_id, {}).get("region_nazev", "Neznámý")

    def get_region_for_cc(cc_id):
        cc = cost_centers.get(cc_id, {})
        return get_region_for_branch(cc.get("pobocka_id", ""))

    def get_account_group(acc_id):
        return accounts.get(acc_id, {}).get("skupina", "")

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
        "revenue": 0.0, "cogs": 0.0, "opex": 0.0, "depreciation": 0.0,
        "total_expenses": 0.0, "receivables": 0.0, "payables": 0.0,
        "asset_debit": 0.0, "asset_credit": 0.0,
        "equity_credit": 0.0, "equity_debit": 0.0,
        "liab_credit": 0.0, "liab_debit": 0.0,
        "cash_inflow": 0.0, "cash_outflow": 0.0
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
        ds = debit_acc.get("skupina", "")
        cs = credit_acc.get("skupina", "")
        year = period[:4]
        all_years.add(year)

        cc_id = t.get("stredisko_id", "")
        if cc_id:
            all_cc_ids.add(cc_id)

        # Strict Balance Sheet & P&L Logic
        # Revenue
        if credit_acc.get("typ") == "Výnosy":
            kpi_data[period]["revenue"] += amount
            
        # Expenses
        if debit_acc.get("typ") == "Náklady":
            kpi_data[period]["total_expenses"] += amount
            if ds.startswith("50") or "Spotřebované" in ds:
                kpi_data[period]["cogs"] += amount
            elif "Odpisy" in ds or ds.startswith("55"):
                kpi_data[period]["depreciation"] += amount
            elif "Daně z příjmů" in ds or ds.startswith("59"):
                pass
            else:
                kpi_data[period]["opex"] += amount

        # Assets (Aktiva) - Debit increases
        if debit_acc.get("typ") == "Aktiva":
            kpi_data[period]["asset_debit"] += amount
        if credit_acc.get("typ") == "Aktiva":
            kpi_data[period]["asset_credit"] += amount
            
        # Liabilities & Equity (Pasiva) - Credit increases
        # Equity is Class 4, Groups 41, 42, 43
        equity_groups = ("41", "42", "43")
        
        # Check Debit Side
        if debit_acc.get("typ") == "Pasiva":
            grp = debit_acc.get("ucet_cislo", "")[:2]
            if grp in equity_groups:
                kpi_data[period]["equity_debit"] += amount
            else:
                kpi_data[period]["liab_debit"] += amount
                
        # Check Credit Side
        if credit_acc.get("typ") == "Pasiva":
            grp = credit_acc.get("ucet_cislo", "")[:2]
            if grp in equity_groups:
                kpi_data[period]["equity_credit"] += amount
            else:
                kpi_data[period]["liab_credit"] += amount

        # Cash Flow (Groups 21, 22)
        # Inflow = Debit 21/22? No, Debit 221 means money came IN to bank. Correct.
        # Outflow = Credit 221 means money went OUT. Correct.
        # Exclude transfers between 21 and 22?
        # If D=211 C=221 (Withdrawal): Inflow 211, Outflow 221. Net 0. Correct.
        if debit_acc.get("ucet_cislo", "").startswith(("21", "22")):
            kpi_data[period]["cash_inflow"] += amount
        if credit_acc.get("ucet_cislo", "").startswith(("21", "22")):
            kpi_data[period]["cash_outflow"] += amount

        # Receivables (Class 3 Aktiva typically)
        if "Pohledávky" in debit_acc.get("skupina", ""):
            kpi_data[period]["receivables"] += amount
        if "Pohledávky" in credit_acc.get("skupina", ""):
             kpi_data[period]["receivables"] -= amount

        # Payables (Class 3 Pasiva typically)
        if "Závazky" in credit_acc.get("skupina", ""):
            kpi_data[period]["payables"] += amount
        if "Závazky" in debit_acc.get("skupina", ""):
             kpi_data[period]["payables"] -= amount

    # Build KPI output with cumulative balance sheet items
    kpi_periods = sorted(kpi_data.keys())
    kpis_output = []
    cumulative_assets = 0.0
    cumulative_equity = 0.0
    cumulative_liabs = 0.0
    
    ytd_net_income = 0.0
    current_year_tracker = ""

    for p in kpi_periods:
        year = p[:4]
        if year != current_year_tracker:
            current_year_tracker = year
            ytd_net_income = 0.0

        d = kpi_data[p]
        rev = d["revenue"]
        cogs = d["cogs"]
        opex = d["opex"]
        depr = d["depreciation"]
        total_exp = d["total_expenses"]
        gross_profit = rev - cogs
        ebitda = rev - cogs - opex
        ebit = ebitda - depr
        net_income = rev - total_exp
        
        ytd_net_income += net_income
        month_idx = int(p.split('-')[1])
        annualized_ni = (ytd_net_income / month_idx) * 12 if month_idx > 0 else 0

        # Running cumulative totals for balance sheet
        # Assets (Debit positive)
        cumulative_assets += (d["asset_debit"] - d["asset_credit"])
        # Equity (Credit positive)
        cumulative_equity += (d["equity_credit"] - d["equity_debit"])
        # Liabilities (Credit positive)
        cumulative_liabs += (d["liab_credit"] - d["liab_debit"])
        
        # Raw values for diagnostics
        raw_assets = cumulative_assets
        raw_liabs = cumulative_liabs
        raw_equity = cumulative_equity
        
        # Adjusted for KPI denominators (avoid div/0)
        total_assets = max(abs(cumulative_assets), 1e6)
        total_equity = max(abs(cumulative_equity), 1e6)

        # Annualized ROA & ROE (using YTD average to smooth out tax/bonus spikes)
        roa = annualized_ni / total_assets * 100
        roe = annualized_ni / total_equity * 100

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
            "total_assets": round(raw_assets, 2),
            "total_equity": round(raw_equity, 2),
            "total_liabilities": round(raw_liabs, 2),
            "dso_days": dso,
            "dpo_days": dpo,
            "roa_pct": round(roa, 2),
            "roe_pct": round(roe, 2),
            "cash_inflow": round(d["cash_inflow"], 2),
            "cash_outflow": round(d["cash_outflow"], 2),
            "net_cashflow": round(d["cash_inflow"] - d["cash_outflow"], 2),
            "burn_rate": round(d["cash_outflow"], 2),
        })


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
    
    # ---------------------------------------------------------
    # EXPLORER DATA
    # ---------------------------------------------------------
    explorer_txs = []
    # Take last 2000 transactions
    recent_txs = transactions[-2000:]
    
    for t in recent_txs:
        row = {
            "id": t["transakce_id"],
            "datum": t["datum"],
            "popis": t["popis"],
            "castka": float(t["castka"]),
            "ucet_md": t["ucet_md"],
            "ucet_dal": t["ucet_dal"],
            "ucet_md_nazev": accounts.get(t["ucet_md"], {}).get("nazev", ""),
            "ucet_dal_nazev": accounts.get(t["ucet_dal"], {}).get("nazev", ""),
            "stredisko": cost_centers.get(t["stredisko_id"], {}).get("stredisko_nazev", t["stredisko_id"]),
            "typ": t["typ_dokladu"]
        }
        explorer_txs.append(row)
        
    explorer_js = f"const EXPLORER_DATA = {json.dumps(explorer_txs, ensure_ascii=False, indent=2)};"
    exp_path = os.path.join(BASE_DIR, "dashboard", "explorer_data.js")
    
    with open(exp_path, 'w', encoding='utf-8') as f:
        f.write(explorer_js)
    print(f"✅ Generated {exp_path} ({len(explorer_txs)} transactions)")
    print(f"   KPIs:     {len(kpis_output)} periods")
    print(f"   OPEX:     {len(opex_rows)} rows")
    print(f"   CAPEX:    {len(capex_rows)} rows")
    print(f"   HR:       {len(hr_rows)} rows")
    print(f"   Sales:    {len(sales_rows)} rows")
    print(f"   Variance: {len(variance_rows)} rows")
    print(f"   Filters:  {len(filters['years'])} years, {len(filters['cost_centers'])} CC, {len(filters['regions'])} regions, {len(filters['categories'])} categories")

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Diagnostic Output (_diag7.txt)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    diag_path = os.path.join(BASE_DIR, "dashboard", "_diag7.txt")
    print(f"\nWriting diagnostics to {diag_path}...")
    with open(diag_path, "w", encoding="utf-8") as f:
        f.write(f"{'PERIOD':<10} | {'ASSETS':>15} | {'LIABILITIES':>15} | {'EQUITY':>15} | {'NET_INCOME':>15} | {'DIFF (A-L-E-NI)':>18} | {'CHECK'}\n")
        f.write("-" * 110 + "\n")
        
        # We need to accumulate net_income over time to reconcile Equity if 'closing' didn't happen to equity account
        # But wait, my generator tracks Retained Earnings? 
        # No, 'net_income' is P&L for the period. 
        # In strict accounting, A = L + E. 
        # E (Equity) typically includes 'Current Earnings' (Net Income).
        # My 'total_equity' is from Class 4. 
        # Net Income is Class 5 vs 6. 
        # So A = L + E_book + NetIncome_cumulative?
        # Yes, until Net Income is moved to Retained Earnings (Class 4).
        # In my generator, I don't move NI to 431 until... well, I didn't verify closing logic.
        # Generator has 'Closing' logic?
        # No, I removed explicit closing entries in previous turn's plan "No Explicit Closing Entries".
        # So 'Balance Sheet' will be balanced ONLY IF we include (Revenue - Expense) as part of Equity.
        # So Check = Assets - (Liabilities + Equity_Book + Cumulative_Net_Income).
        
        cum_ni = 0.0
        for k in kpis_output:
            p = k["period"]
            assets = k["total_assets"]
            liabs = k["total_liabilities"]
            equity = k["total_equity"] # Class 4
            ni = k["net_income"]
            cum_ni += ni
            
            diff = assets - (liabs + equity + cum_ni)
            status = "OK" if abs(diff) < 1000 else "FAIL" # 1000 tolerance for rounding
            
            f.write(f"{p:<10} | {assets:>15,.2f} | {liabs:>15,.2f} | {equity:>15,.2f} | {cum_ni:>15,.2f} | {diff:>18,.2f} | {status}\n")


if __name__ == "__main__":
    main()
