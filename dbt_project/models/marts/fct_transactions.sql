-- fct_transactions: Final enriched transaction fact table
-- Joins transactions with all dimension tables for full analytical context

with transactions as (
    select * from {{ ref('int_transactions_with_fx') }}
),

cost_centers as (
    select * from {{ ref('stg_cost_centers') }}
),

branches as (
    select * from {{ ref('stg_branches') }}
),

regions as (
    select * from {{ ref('stg_regions') }}
),

profit_centers as (
    select * from {{ ref('stg_profit_centers') }}
),

projects as (
    select * from {{ ref('stg_projects') }}
),

debit_accounts as (
    select
        account_number,
        account_name    as debit_account_name,
        account_type    as debit_account_type,
        account_group   as debit_account_group
    from {{ ref('stg_accounts') }}
),

credit_accounts as (
    select
        account_number,
        account_name    as credit_account_name,
        account_type    as credit_account_type,
        account_group   as credit_account_group
    from {{ ref('stg_accounts') }}
)

select
    -- Transaction
    t.transaction_id,
    t.transaction_date,
    t.fiscal_year,
    t.fiscal_month,
    t.fiscal_period,
    t.document_type,
    t.status,

    -- Amounts
    t.amount_original,
    t.currency,
    t.exchange_rate,
    t.amount_czk,
    t.vat_rate,
    t.vat_amount,
    t.vat_amount_czk,

    -- Debit account
    t.debit_account,
    da.debit_account_name,
    da.debit_account_type,
    da.debit_account_group,

    -- Credit account
    t.credit_account,
    ca.credit_account_name,
    ca.credit_account_type,
    ca.credit_account_group,

    -- Cost center
    t.cost_center_id,
    cc.cost_center_name,
    cc.type             as cost_center_type,

    -- Branch & Region
    t.branch_id,
    b.branch_name,
    b.city              as branch_city,
    r.region_id,
    r.region_name,
    r.country,

    -- Profit center
    t.profit_center_id,
    pc.name             as profit_center_name,

    -- Project
    t.project_id,
    p.project_name,
    p.type              as project_type,

    -- Metadata
    t.description,
    t.user_id

from transactions t
left join cost_centers cc   on t.cost_center_id = cc.cost_center_id
left join branches b        on t.branch_id = b.branch_id
left join regions r         on b.region_id = r.region_id
left join profit_centers pc on t.profit_center_id = pc.profit_center_id
left join projects p        on t.project_id = p.project_id
left join debit_accounts da on t.debit_account = da.account_number
left join credit_accounts ca on t.credit_account = ca.account_number
