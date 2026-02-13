-- pnl_report: Profit & Loss Statement
-- =====================================
-- Aggregates revenue and expense transactions by period, cost center, profit center
-- Uses double-entry accounting: debit to expense = cost, credit from revenue = income

with transactions as (
    select * from {{ ref('int_transactions_with_fx') }}
    where status = 'Zaúčtováno'  -- Only posted transactions
),

accounts as (
    select * from {{ ref('dim_accounts') }}
),

-- Revenue: amounts credited TO revenue accounts (class 6)
revenue as (
    select
        t.fiscal_period,
        t.fiscal_year,
        t.fiscal_month,
        t.cost_center_id,
        t.profit_center_id,
        a.pnl_line_item,
        a.account_group,
        sum(t.amount_czk) as amount_czk
    from transactions t
    inner join accounts a on t.credit_account = a.account_number
    where a.account_type = 'Výnosy'
    group by
        t.fiscal_period, t.fiscal_year, t.fiscal_month,
        t.cost_center_id, t.profit_center_id,
        a.pnl_line_item, a.account_group
),

-- Expenses: amounts debited TO expense accounts (class 5)
expenses as (
    select
        t.fiscal_period,
        t.fiscal_year,
        t.fiscal_month,
        t.cost_center_id,
        t.profit_center_id,
        a.pnl_line_item,
        a.account_group,
        sum(t.amount_czk) as amount_czk
    from transactions t
    inner join accounts a on t.debit_account = a.account_number
    where a.account_type = 'Náklady'
    group by
        t.fiscal_period, t.fiscal_year, t.fiscal_month,
        t.cost_center_id, t.profit_center_id,
        a.pnl_line_item, a.account_group
),

-- Combine revenue and expenses
combined as (
    select
        fiscal_period,
        fiscal_year,
        fiscal_month,
        cost_center_id,
        profit_center_id,
        pnl_line_item,
        account_group,
        'Revenue'   as pnl_category,
        amount_czk
    from revenue

    union all

    select
        fiscal_period,
        fiscal_year,
        fiscal_month,
        cost_center_id,
        profit_center_id,
        pnl_line_item,
        account_group,
        'Expense'   as pnl_category,
        -amount_czk  -- Expenses are negative in P&L
    from expenses
),

-- Enrich with dimension names
cost_centers as (
    select cost_center_id, cost_center_name from {{ ref('stg_cost_centers') }}
),

profit_centers as (
    select profit_center_id, name as profit_center_name from {{ ref('stg_profit_centers') }}
)

select
    c.fiscal_period,
    c.fiscal_year,
    c.fiscal_month,
    c.cost_center_id,
    cc.cost_center_name,
    c.profit_center_id,
    pc.profit_center_name,
    c.pnl_category,
    c.pnl_line_item,
    c.account_group,
    c.amount_czk,

    -- Running P&L summary per group
    sum(c.amount_czk) over (
        partition by c.fiscal_year, c.cost_center_id, c.profit_center_id
        order by c.fiscal_month
    ) as ytd_amount_czk

from combined c
left join cost_centers cc on c.cost_center_id = cc.cost_center_id
left join profit_centers pc on c.profit_center_id = pc.profit_center_id
