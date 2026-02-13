-- int_cost_center_expenses: Aggregate all expense types by cost center and period
-- Combines: payroll, purchases, production overhead, and transaction-based costs

with payroll as (
    select
        cost_center_id,
        period             as fiscal_period,
        sum(total_employer_cost) as payroll_cost
    from {{ ref('stg_payroll') }}
    group by cost_center_id, period
),

purchases as (
    select
        cost_center_id,
        to_char(order_date, 'YYYY-MM') as fiscal_period,
        sum(total_excl_vat) as purchase_cost
    from {{ ref('stg_purchases') }}
    where status != 'Koncept'  -- Exclude drafts
    group by cost_center_id, to_char(order_date, 'YYYY-MM')
),

production as (
    select
        cost_center_id,
        to_char(start_date, 'YYYY-MM') as fiscal_period,
        sum(material_cost)  as production_material_cost,
        sum(labor_cost)     as production_labor_cost,
        sum(overhead_cost)  as production_overhead_cost,
        sum(total_cost)     as production_total_cost
    from {{ ref('stg_production_orders') }}
    where status != 'Zrušeno'  -- Exclude cancelled
    group by cost_center_id, to_char(start_date, 'YYYY-MM')
),

cost_centers as (
    select * from {{ ref('stg_cost_centers') }}
),

-- Generate all period × cost_center combinations
periods as (
    select distinct fiscal_period from (
        select fiscal_period from payroll
        union
        select fiscal_period from purchases
        union
        select fiscal_period from production
    ) p
),

spine as (
    select cc.cost_center_id, per.fiscal_period
    from cost_centers cc
    cross join periods per
)

select
    s.cost_center_id,
    cc.cost_center_name,
    cc.type                     as cost_center_type,
    cc.branch_id,
    s.fiscal_period,
    split_part(s.fiscal_period, '-', 1)::integer as fiscal_year,
    split_part(s.fiscal_period, '-', 2)::integer as fiscal_month,
    coalesce(pay.payroll_cost, 0)               as payroll_cost,
    coalesce(pur.purchase_cost, 0)              as purchase_cost,
    coalesce(prod.production_material_cost, 0)  as production_material_cost,
    coalesce(prod.production_labor_cost, 0)     as production_labor_cost,
    coalesce(prod.production_overhead_cost, 0)  as production_overhead_cost,
    coalesce(prod.production_total_cost, 0)     as production_total_cost,
    -- Total expenses
    coalesce(pay.payroll_cost, 0)
        + coalesce(pur.purchase_cost, 0)
        + coalesce(prod.production_total_cost, 0) as total_expenses
from spine s
left join cost_centers cc on s.cost_center_id = cc.cost_center_id
left join payroll pay on s.cost_center_id = pay.cost_center_id and s.fiscal_period = pay.fiscal_period
left join purchases pur on s.cost_center_id = pur.cost_center_id and s.fiscal_period = pur.fiscal_period
left join production prod on s.cost_center_id = prod.cost_center_id and s.fiscal_period = prod.fiscal_period
where coalesce(pay.payroll_cost, 0) + coalesce(pur.purchase_cost, 0) + coalesce(prod.production_total_cost, 0) > 0
