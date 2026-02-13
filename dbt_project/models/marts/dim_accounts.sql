-- dim_accounts: Clean chart of accounts for financial reporting
-- Enriched with account classification for P&L mapping

with accounts as (
    select * from {{ ref('stg_accounts') }}
)

select
    account_number,
    account_name,
    account_type,
    account_group,
    account_class,
    status,

    -- P&L classification
    case
        when account_type = 'Výnosy'    then 'Revenue'
        when account_type = 'Náklady'   then 'Expense'
        when account_type = 'Aktiva'    then 'Asset'
        when account_type = 'Pasiva'    then 'Liability'
    end as account_type_en,

    -- P&L flag
    account_type in ('Výnosy', 'Náklady') as is_pnl_account,

    -- Balance sheet flag
    account_type in ('Aktiva', 'Pasiva') as is_balance_sheet_account,

    -- Detailed line classification for P&L report
    case
        when account_class = '5' and account_group like '%Spotřebované%'    then 'Cost of Goods Sold'
        when account_class = '5' and account_group like '%Služby%'          then 'Services'
        when account_class = '5' and account_group like '%Osobní%'          then 'Personnel Costs'
        when account_class = '5' and account_group like '%Daně%'            then 'Taxes & Fees'
        when account_class = '5' and account_group like '%provozní%'        then 'Other Operating Expenses'
        when account_class = '5' and account_group like '%Odpisy%'          then 'Depreciation'
        when account_class = '5' and account_group like '%Finanční%'        then 'Financial Expenses'
        when account_class = '6' and account_group like '%výrobky%'         then 'Product Revenue'
        when account_class = '6' and account_group like '%služby%'          then 'Service Revenue'
        when account_class = '6' and account_group like '%zboží%'           then 'Merchandise Revenue'
        when account_class = '6' and account_group like '%provozní%'        then 'Other Operating Revenue'
        when account_class = '6' and account_group like '%Finanční%'        then 'Financial Revenue'
        else 'Other'
    end as pnl_line_item

from accounts
