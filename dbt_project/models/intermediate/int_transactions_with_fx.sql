-- int_transactions_with_fx: Normalize all transaction amounts to CZK
-- Ensures consistent currency for financial reporting

with transactions as (
    select * from {{ ref('stg_transactions') }}
),

fx_rates as (
    -- Static FX rate table (from source data conventions)
    select 'CZK' as currency, 1.0::numeric as rate_to_czk
    union all
    select 'EUR', 24.5
    union all
    select 'USD', 22.8
)

select
    t.transaction_id,
    t.transaction_date,
    t.document_type,
    t.amount               as amount_original,
    t.currency,
    t.exchange_rate,
    -- Use the recorded CZK amount if available, otherwise compute from FX table
    coalesce(t.amount_czk, t.amount * fx.rate_to_czk)  as amount_czk,
    t.vat_rate,
    t.vat_amount,
    coalesce(t.vat_amount * fx.rate_to_czk, t.vat_amount) as vat_amount_czk,
    t.debit_account,
    t.credit_account,
    t.cost_center_id,
    t.project_id,
    t.profit_center_id,
    t.branch_id,
    t.description,
    t.status,
    t.user_id,
    -- Derived fields
    extract(year from t.transaction_date)   as fiscal_year,
    extract(month from t.transaction_date)  as fiscal_month,
    to_char(t.transaction_date, 'YYYY-MM')  as fiscal_period
from transactions t
left join fx_rates fx on t.currency = fx.currency
