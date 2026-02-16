-- mart_kpis: Key Performance Indicators for Financial Controlling
-- ================================================================
-- Calculates: EBITDA, EBITDA Margin, Gross Margin, ROA, ROE,
-- DSO, DPO, Burn Rate — all by fiscal period

with -- Revenue from P&L (class 6 accounts)
revenue as (
    select
        t.fiscal_period,
        t.fiscal_year,
        t.fiscal_month,
        sum(t.amount_czk) as total_revenue
    from {{ ref('int_transactions_with_fx') }} t
    inner join {{ ref('stg_accounts') }} a on t.credit_account = a.account_number
    where t.status = 'Zaúčtováno'
      and a.account_type = 'Výnosy'
    group by t.fiscal_period, t.fiscal_year, t.fiscal_month
),

-- COGS (Spotřebované nákupy – class 5)
cogs as (
    select
        t.fiscal_period,
        sum(t.amount_czk) as total_cogs
    from {{ ref('int_transactions_with_fx') }} t
    inner join {{ ref('stg_accounts') }} a on t.debit_account = a.account_number
    where t.status = 'Zaúčtováno'
      and a.account_group like '%Spotřebované%'
    group by t.fiscal_period
),

-- Operating expenses (all class 5 except depreciation)
opex as (
    select
        t.fiscal_period,
        sum(t.amount_czk) as total_opex
    from {{ ref('int_transactions_with_fx') }} t
    inner join {{ ref('stg_accounts') }} a on t.debit_account = a.account_number
    where t.status = 'Zaúčtováno'
      and a.account_type = 'Náklady'
      and a.account_group not like '%Odpisy%'
      and a.account_group not like '%Daně z příjmů%'
    group by t.fiscal_period
),

-- Depreciation
depreciation as (
    select
        t.fiscal_period,
        sum(t.amount_czk) as total_depreciation
    from {{ ref('int_transactions_with_fx') }} t
    inner join {{ ref('stg_accounts') }} a on t.debit_account = a.account_number
    where t.status = 'Zaúčtováno'
      and a.account_group like '%Odpisy%'
    group by t.fiscal_period
),

-- Total expenses (all class 5)
total_expenses as (
    select
        t.fiscal_period,
        sum(t.amount_czk) as total_expenses
    from {{ ref('int_transactions_with_fx') }} t
    inner join {{ ref('stg_accounts') }} a on t.debit_account = a.account_number
    where t.status = 'Zaúčtováno'
      and a.account_type = 'Náklady'
    group by t.fiscal_period
),

-- Receivables (Pohledávky – class 3, Aktiva)
receivables as (
    select
        t.fiscal_period,
        sum(t.amount_czk) as total_receivables
    from {{ ref('int_transactions_with_fx') }} t
    inner join {{ ref('stg_accounts') }} a on t.debit_account = a.account_number
    where t.status = 'Zaúčtováno'
      and a.account_group like '%Pohledávky%'
    group by t.fiscal_period
),

-- Payables (Závazky – class 3, Pasiva)
payables as (
    select
        t.fiscal_period,
        sum(t.amount_czk) as total_payables
    from {{ ref('int_transactions_with_fx') }} t
    inner join {{ ref('stg_accounts') }} a on t.credit_account = a.account_number
    where t.status = 'Zaúčtováno'
      and a.account_group like '%Závazky%'
      and a.account_group not like '%Dlouhodobé%'
    group by t.fiscal_period
),

-- Total assets (class 0-2, Aktiva type)
assets as (
    select
        t.fiscal_period,
        sum(t.amount_czk) as total_assets
    from {{ ref('int_transactions_with_fx') }} t
    inner join {{ ref('stg_accounts') }} a on t.debit_account = a.account_number
    where t.status = 'Zaúčtováno'
      and a.account_type = 'Aktiva'
    group by t.fiscal_period
),

-- Equity (Vlastní kapitál + Fondy + Výsledek hospodaření)
equity as (
    select
        t.fiscal_period,
        sum(t.amount_czk) as total_equity
    from {{ ref('int_transactions_with_fx') }} t
    inner join {{ ref('stg_accounts') }} a on t.credit_account = a.account_number
    where t.status = 'Zaúčtováno'
      and a.account_group in ('Vlastní kapitál', 'Fondy', 'Výsledek hospodaření')
    group by t.fiscal_period
),

-- Cash outflow from cashflow data (for Burn Rate)
cash_burn as (
    select
        to_char(transaction_date, 'YYYY-MM') as fiscal_period,
        sum(case when amount < 0 then abs(amount) else 0 end) as cash_outflow,
        sum(case when amount > 0 then amount else 0 end) as cash_inflow,
        sum(amount) as net_cashflow
    from {{ ref('stg_cashflow') }}
    where status = 'Realizováno'
    group by to_char(transaction_date, 'YYYY-MM')
),

-- Purchases total for DPO calculation
purchases_total as (
    select
        to_char(order_date, 'YYYY-MM') as fiscal_period,
        sum(total_excl_vat) as total_purchases
    from {{ ref('stg_purchases') }}
    where status != 'Koncept'
    group by to_char(order_date, 'YYYY-MM')
)

select
    r.fiscal_period,
    r.fiscal_year,
    r.fiscal_month,

    -- Revenue
    r.total_revenue,

    -- COGS & Gross Margin
    coalesce(c.total_cogs, 0)                       as total_cogs,
    r.total_revenue - coalesce(c.total_cogs, 0)     as gross_profit,
    case when r.total_revenue > 0
        then round((r.total_revenue - coalesce(c.total_cogs, 0))
                    / r.total_revenue * 100, 2)
        else 0
    end                                              as gross_margin_pct,

    -- EBITDA
    coalesce(o.total_opex, 0)                        as total_opex,
    coalesce(d.total_depreciation, 0)                as total_depreciation,
    r.total_revenue - coalesce(o.total_opex, 0)      as ebitda,
    case when r.total_revenue > 0
        then round((r.total_revenue - coalesce(o.total_opex, 0))
                    / r.total_revenue * 100, 2)
        else 0
    end                                              as ebitda_margin_pct,

    -- EBIT (operating profit)
    r.total_revenue - coalesce(o.total_opex, 0) - coalesce(d.total_depreciation, 0) as ebit,

    -- Net Income
    r.total_revenue - coalesce(te.total_expenses, 0) as net_income,

    -- ROA (annualized)
    case when coalesce(a.total_assets, 0) > 0
        then round((r.total_revenue - coalesce(te.total_expenses, 0))
                    / a.total_assets * 12 * 100, 2)
        else 0
    end                                              as roa_annualized_pct,

    -- ROE (annualized)
    case when coalesce(eq.total_equity, 0) > 0
        then round((r.total_revenue - coalesce(te.total_expenses, 0))
                    / eq.total_equity * 12 * 100, 2)
        else 0
    end                                              as roe_annualized_pct,

    -- DSO (Days Sales Outstanding)
    case when r.total_revenue > 0
        then round(coalesce(rec.total_receivables, 0)
                    / (r.total_revenue / 30), 1)
        else 0
    end                                              as dso_days,

    -- DPO (Days Payables Outstanding)
    case when coalesce(pt.total_purchases, 0) > 0
        then round(coalesce(pay.total_payables, 0)
                    / (pt.total_purchases / 30), 1)
        else 0
    end                                              as dpo_days,

    -- Cash Flow & Burn Rate
    coalesce(cb.cash_inflow, 0)                      as cash_inflow,
    coalesce(cb.cash_outflow, 0)                     as cash_outflow,
    coalesce(cb.net_cashflow, 0)                     as net_cashflow,
    coalesce(cb.cash_outflow, 0)                     as monthly_burn_rate,

    -- Working capital proxy
    coalesce(rec.total_receivables, 0) - coalesce(pay.total_payables, 0) as net_working_capital

from revenue r
left join cogs c on r.fiscal_period = c.fiscal_period
left join opex o on r.fiscal_period = o.fiscal_period
left join depreciation d on r.fiscal_period = d.fiscal_period
left join total_expenses te on r.fiscal_period = te.fiscal_period
left join receivables rec on r.fiscal_period = rec.fiscal_period
left join payables pay on r.fiscal_period = pay.fiscal_period
left join assets a on r.fiscal_period = a.fiscal_period
left join equity eq on r.fiscal_period = eq.fiscal_period
left join cash_burn cb on r.fiscal_period = cb.fiscal_period
left join purchases_total pt on r.fiscal_period = pt.fiscal_period
order by r.fiscal_year, r.fiscal_month
