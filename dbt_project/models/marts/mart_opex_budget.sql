-- mart_opex_budget: Operational Expenditure Budget
-- ================================================
-- Breaks down OPEX by category (rent/services, energy/materials, marketing,
-- travel, personnel) per cost center × period
-- Compares plan vs actual from budget data

with budget as (
    select * from {{ ref('stg_budget') }}
),

accounts as (
    select * from {{ ref('stg_accounts') }}
),

cost_centers as (
    select * from {{ ref('stg_cost_centers') }}
),

branches as (
    select * from {{ ref('stg_branches') }}
),

-- Classify OPEX categories from Czech account groups
opex_budget as (
    select
        b.cost_center_id,
        b.account_number,
        a.account_name,
        a.account_group,
        b.period                as fiscal_period,
        split_part(b.period, '-', 1)::integer as fiscal_year,
        split_part(b.period, '-', 2)::integer as fiscal_month,
        b.planned_amount,
        b.actual_amount,
        b.variance,
        b.variance_pct,
        -- OPEX category mapping
        case
            when a.account_group like '%Služby%'            then 'Rent & Services'
            when a.account_group like '%Spotřebované%'      then 'Energy & Materials'
            when a.account_group like '%Osobní%'            then 'Personnel'
            when a.account_group like '%provozní náklady%'  then 'Marketing & Travel'
            when a.account_group like '%Daně a poplatky%'   then 'Taxes & Fees'
            when a.account_group like '%Finanční náklady%'  then 'Financial Costs'
            else 'Other OPEX'
        end as opex_category
    from budget b
    inner join accounts a on b.account_number = a.account_number
    where a.account_type = 'Náklady'
      and a.account_group not like '%Odpisy%'       -- Exclude depreciation (CAPEX)
      and a.account_group not like '%Daně z příjmů%' -- Exclude income tax
)

select
    ob.cost_center_id,
    cc.cost_center_name,
    cc.type                 as cost_center_type,
    cc.branch_id,
    br.branch_name,
    ob.fiscal_period,
    ob.fiscal_year,
    ob.fiscal_month,
    ob.opex_category,
    ob.account_number,
    ob.account_name,
    ob.account_group,
    ob.planned_amount,
    ob.actual_amount,
    ob.variance,
    ob.variance_pct,
    -- Variance classification
    case
        when abs(ob.variance_pct) <= 5   then 'On Track'
        when ob.variance_pct > 5         then 'Over Budget'
        when ob.variance_pct < -5        then 'Under Budget'
    end as variance_status,
    -- YTD planned
    sum(ob.planned_amount) over (
        partition by ob.fiscal_year, ob.cost_center_id, ob.opex_category
        order by ob.fiscal_month
    ) as ytd_planned,
    -- YTD actual
    sum(ob.actual_amount) over (
        partition by ob.fiscal_year, ob.cost_center_id, ob.opex_category
        order by ob.fiscal_month
    ) as ytd_actual
from opex_budget ob
left join cost_centers cc on ob.cost_center_id = cc.cost_center_id
left join branches br on cc.branch_id = br.branch_id
