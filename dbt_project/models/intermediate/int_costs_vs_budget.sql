-- int_costs_vs_budget: Join budget plan vs actual by cost center, account, period
-- Core controlling analysis: where are we over/under budget?

with budget as (
    select * from {{ ref('stg_budget') }}
),

accounts as (
    select * from {{ ref('stg_accounts') }}
),

cost_centers as (
    select * from {{ ref('stg_cost_centers') }}
)

select
    b.cost_center_id,
    cc.cost_center_name,
    cc.type                 as cost_center_type,
    b.account_number,
    a.account_name,
    a.account_type,
    a.account_group,
    b.period,
    -- Split period into year and month
    split_part(b.period, '-', 1)::integer   as fiscal_year,
    split_part(b.period, '-', 2)::integer   as fiscal_month,
    b.planned_amount,
    b.actual_amount,
    b.variance,
    b.variance_pct,
    -- Categorize variance
    case
        when abs(b.variance_pct) <= 5  then 'On Track'
        when b.variance_pct > 5        then 'Over Budget'
        when b.variance_pct < -5       then 'Under Budget'
    end as variance_category,
    -- Flag significant deviations (> 20%)
    abs(b.variance_pct) > 20 as is_significant_deviation
from budget b
left join accounts a on b.account_number = a.account_number
left join cost_centers cc on b.cost_center_id = cc.cost_center_id
