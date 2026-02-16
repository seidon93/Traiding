-- mart_variance_analysis: Full Variance Decomposition
-- ====================================================
-- Decomposes plan-vs-actual differences into:
--   Volume variance: (actual_qty - plan_qty) × plan_price
--   Price variance:  (actual_price - plan_price) × actual_qty
--   Cost variance:   actual_cost - budgeted_cost
--   Mix variance:    impact of product mix shift on overall margin

with sales as (
    select * from {{ ref('stg_sales') }}
    where payment_status != 'Storno'
),

products as (
    select * from {{ ref('stg_products') }}
),

regions as (
    select * from {{ ref('stg_regions') }}
),

branches as (
    select * from {{ ref('stg_branches') }}
),

-- Actual sales by product × period
actual_by_product as (
    select
        p.category                                      as product_category,
        r.region_name,
        to_char(s.invoice_date, 'YYYY-MM')              as fiscal_period,
        extract(year from s.invoice_date)::integer       as fiscal_year,
        extract(month from s.invoice_date)::integer      as fiscal_month,
        sum(s.quantity)                                  as actual_qty,
        sum(s.total_excl_vat)                            as actual_revenue,
        sum(s.total_cost)                                as actual_cogs,
        case when sum(s.quantity) > 0
            then sum(s.total_excl_vat) / sum(s.quantity)
            else 0
        end                                              as actual_avg_price,
        case when sum(s.quantity) > 0
            then sum(s.total_cost) / sum(s.quantity)
            else 0
        end                                              as actual_avg_cost
    from sales s
    left join products p on s.product_id = p.product_id
    left join branches b on s.branch_id = b.branch_id
    left join regions r on b.region_id = r.region_id
    group by p.category, r.region_name,
             to_char(s.invoice_date, 'YYYY-MM'),
             extract(year from s.invoice_date),
             extract(month from s.invoice_date)
),

-- Plan baseline: use previous year same month as "plan"
-- (in real world this would come from a budget/forecast table)
plan_baseline as (
    select
        a.product_category,
        a.region_name,
        a.fiscal_year + 1                               as plan_for_year,
        a.fiscal_month,
        a.actual_qty                                     as plan_qty,
        a.actual_avg_price                               as plan_price,
        a.actual_avg_cost                                as plan_cost_per_unit,
        a.actual_revenue                                 as plan_revenue,
        a.actual_cogs                                    as plan_cogs
    from actual_by_product a
),

-- Join actuals with plan
variance as (
    select
        a.product_category,
        a.region_name,
        a.fiscal_period,
        a.fiscal_year,
        a.fiscal_month,

        -- Actuals
        a.actual_qty,
        a.actual_avg_price,
        a.actual_avg_cost,
        a.actual_revenue,
        a.actual_cogs,
        a.actual_revenue - a.actual_cogs                as actual_gross_profit,

        -- Plan
        coalesce(p.plan_qty, 0)                         as plan_qty,
        coalesce(p.plan_price, 0)                       as plan_price,
        coalesce(p.plan_cost_per_unit, 0)               as plan_cost_per_unit,
        coalesce(p.plan_revenue, 0)                     as plan_revenue,
        coalesce(p.plan_cogs, 0)                        as plan_cogs,
        coalesce(p.plan_revenue, 0) - coalesce(p.plan_cogs, 0) as plan_gross_profit,

        -- Total variance
        a.actual_revenue - coalesce(p.plan_revenue, 0)  as total_revenue_variance,

        -- VOLUME VARIANCE: (actual_qty - plan_qty) × plan_price
        (a.actual_qty - coalesce(p.plan_qty, 0)) * coalesce(p.plan_price, 0) as volume_variance,

        -- PRICE VARIANCE: (actual_price - plan_price) × actual_qty
        (a.actual_avg_price - coalesce(p.plan_price, 0)) * a.actual_qty as price_variance,

        -- COST VARIANCE: actual_cogs - plan_cogs (adjusted for actual volume)
        a.actual_cogs - (coalesce(p.plan_cost_per_unit, 0) * a.actual_qty) as cost_variance,

        -- Gross profit variance
        (a.actual_revenue - a.actual_cogs) - (coalesce(p.plan_revenue, 0) - coalesce(p.plan_cogs, 0))
            as gross_profit_variance

    from actual_by_product a
    left join plan_baseline p
        on a.product_category = p.product_category
        and a.region_name = p.region_name
        and a.fiscal_year = p.plan_for_year
        and a.fiscal_month = p.fiscal_month
),

-- MIX VARIANCE: how product mix changes affect overall profitability
-- Calculated at the total level per period × region
totals as (
    select
        fiscal_period,
        fiscal_year,
        fiscal_month,
        region_name,
        sum(actual_revenue)     as total_actual_revenue,
        sum(plan_revenue)       as total_plan_revenue,
        sum(actual_qty)         as total_actual_qty,
        sum(plan_qty)           as total_plan_qty
    from variance
    group by fiscal_period, fiscal_year, fiscal_month, region_name
)

select
    v.*,

    -- Revenue share (mix)
    case when t.total_actual_revenue > 0
        then round(v.actual_revenue / t.total_actual_revenue * 100, 2)
        else 0
    end as actual_revenue_share_pct,
    case when t.total_plan_revenue > 0
        then round(v.plan_revenue / t.total_plan_revenue * 100, 2)
        else 0
    end as plan_revenue_share_pct,

    -- MIX VARIANCE: difference in revenue share × total planned revenue
    case when t.total_plan_revenue > 0 and t.total_actual_revenue > 0
        then round(
            (v.actual_revenue / t.total_actual_revenue - v.plan_revenue / t.total_plan_revenue)
            * t.total_plan_revenue, 2)
        else 0
    end as mix_variance,

    -- Variance significance flags
    abs(v.volume_variance) > 100000 as is_volume_significant,
    abs(v.price_variance) > 100000  as is_price_significant,
    abs(v.cost_variance) > 100000   as is_cost_significant

from variance v
left join totals t
    on v.fiscal_period = t.fiscal_period
    and v.region_name = t.region_name
