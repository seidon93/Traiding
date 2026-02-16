-- mart_capex_budget: Capital Expenditure Budget & Depreciation
-- ============================================================
-- Tracks investments in long-term assets (class 0 accounts)
-- and their depreciation over time

with transactions as (
    select * from {{ ref('int_transactions_with_fx') }}
    where status = 'Zaúčtováno'
),

accounts as (
    select * from {{ ref('stg_accounts') }}
),

cost_centers as (
    select * from {{ ref('stg_cost_centers') }}
),

-- CAPEX: Investments into long-term assets (class 0, Aktiva)
capex as (
    select
        t.fiscal_period,
        t.fiscal_year,
        t.fiscal_month,
        t.cost_center_id,
        a.account_group,
        case
            when a.account_group like '%nehmotný%'  then 'Intangible Assets'
            when a.account_group like '%hmotný%'    then 'Tangible Assets'
            when a.account_group like '%finanční%'  then 'Financial Assets'
            else 'Other Long-term Assets'
        end as asset_category,
        sum(t.amount_czk) as investment_czk
    from transactions t
    inner join accounts a on t.debit_account = a.account_number
    where a.account_class = '0'
      and a.account_group not like '%Oprávky%'  -- Exclude accumulated depreciation
    group by
        t.fiscal_period, t.fiscal_year, t.fiscal_month,
        t.cost_center_id, a.account_group
),

-- Depreciation: charges to depreciation expense accounts
depreciation as (
    select
        t.fiscal_period,
        t.fiscal_year,
        t.fiscal_month,
        t.cost_center_id,
        sum(t.amount_czk) as depreciation_czk
    from transactions t
    inner join accounts a on t.debit_account = a.account_number
    where a.account_group like '%Odpisy%'
    group by
        t.fiscal_period, t.fiscal_year, t.fiscal_month,
        t.cost_center_id
),

-- Accumulated depreciation (contra-asset accounts)
accumulated_depr as (
    select
        t.fiscal_period,
        t.fiscal_year,
        t.fiscal_month,
        t.cost_center_id,
        sum(t.amount_czk) as accumulated_depreciation_czk
    from transactions t
    inner join accounts a on t.credit_account = a.account_number
    where a.account_group like '%Oprávky%'
    group by
        t.fiscal_period, t.fiscal_year, t.fiscal_month,
        t.cost_center_id
),

-- Budget plan for depreciation accounts
budget_depr as (
    select
        b.cost_center_id,
        b.period     as fiscal_period,
        split_part(b.period, '-', 1)::integer as fiscal_year,
        split_part(b.period, '-', 2)::integer as fiscal_month,
        sum(b.planned_amount) as planned_depreciation,
        sum(b.actual_amount)  as actual_depreciation_budget
    from {{ ref('stg_budget') }} b
    inner join accounts a on b.account_number = a.account_number
    where a.account_group like '%Odpisy%'
    group by b.cost_center_id, b.period
)

select
    coalesce(c.fiscal_period, d.fiscal_period, ad.fiscal_period) as fiscal_period,
    coalesce(c.fiscal_year, d.fiscal_year, ad.fiscal_year)       as fiscal_year,
    coalesce(c.fiscal_month, d.fiscal_month, ad.fiscal_month)    as fiscal_month,
    coalesce(c.cost_center_id, d.cost_center_id, ad.cost_center_id) as cost_center_id,
    cc.cost_center_name,
    c.asset_category,
    -- CAPEX
    coalesce(c.investment_czk, 0)               as investment_czk,
    -- Depreciation
    coalesce(d.depreciation_czk, 0)             as depreciation_expense_czk,
    coalesce(ad.accumulated_depreciation_czk, 0) as accumulated_depreciation_czk,
    -- Net book value proxy
    coalesce(c.investment_czk, 0) - coalesce(ad.accumulated_depreciation_czk, 0) as net_book_value_czk,
    -- Budget comparison
    coalesce(bd.planned_depreciation, 0)        as planned_depreciation,
    coalesce(d.depreciation_czk, 0) - coalesce(bd.planned_depreciation, 0) as depreciation_variance,
    -- YTD investment
    sum(coalesce(c.investment_czk, 0)) over (
        partition by coalesce(c.fiscal_year, d.fiscal_year),
                     coalesce(c.cost_center_id, d.cost_center_id)
        order by coalesce(c.fiscal_month, d.fiscal_month)
    ) as ytd_investment_czk
from capex c
full outer join depreciation d
    on c.cost_center_id = d.cost_center_id
    and c.fiscal_period = d.fiscal_period
full outer join accumulated_depr ad
    on coalesce(c.cost_center_id, d.cost_center_id) = ad.cost_center_id
    and coalesce(c.fiscal_period, d.fiscal_period) = ad.fiscal_period
left join cost_centers cc
    on coalesce(c.cost_center_id, d.cost_center_id, ad.cost_center_id) = cc.cost_center_id
left join budget_depr bd
    on coalesce(c.cost_center_id, d.cost_center_id, ad.cost_center_id) = bd.cost_center_id
    and coalesce(c.fiscal_period, d.fiscal_period, ad.fiscal_period) = bd.fiscal_period
