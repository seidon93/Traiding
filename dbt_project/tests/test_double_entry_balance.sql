-- test_double_entry_balance.sql
-- ============================================================
-- Custom Data Quality Test: Double-Entry Bookkeeping Validation
-- ============================================================
-- In double-entry accounting, every debit has a corresponding credit.
-- This test verifies that for each fiscal period, the total amount
-- debited to P&L accounts (class 5+6) equals the total amount credited.
--
-- The test FAILS if any rows are returned (periods with imbalance).
-- Tolerance: 0.01 CZK (rounding)

with posted_transactions as (
    select * from {{ ref('int_transactions_with_fx') }}
    where status = 'Zaúčtováno'  -- Only fully posted entries
),

accounts as (
    select account_number, account_type
    from {{ ref('stg_accounts') }}
),

-- Sum debits per period (amount going TO debit account)
debit_totals as (
    select
        t.fiscal_period,
        sum(t.amount_czk) as total_debit_czk
    from posted_transactions t
    inner join accounts a on t.debit_account = a.account_number
    group by t.fiscal_period
),

-- Sum credits per period (amount going FROM credit account)
credit_totals as (
    select
        t.fiscal_period,
        sum(t.amount_czk) as total_credit_czk
    from posted_transactions t
    inner join accounts a on t.credit_account = a.account_number
    group by t.fiscal_period
)

-- Return periods where debits ≠ credits (with tolerance)
select
    coalesce(d.fiscal_period, c.fiscal_period) as fiscal_period,
    coalesce(d.total_debit_czk, 0)             as total_debit_czk,
    coalesce(c.total_credit_czk, 0)            as total_credit_czk,
    coalesce(d.total_debit_czk, 0) - coalesce(c.total_credit_czk, 0) as imbalance_czk
from debit_totals d
full outer join credit_totals c on d.fiscal_period = c.fiscal_period
where abs(coalesce(d.total_debit_czk, 0) - coalesce(c.total_credit_czk, 0)) > 0.01
