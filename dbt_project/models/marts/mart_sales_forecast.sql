-- mart_sales_forecast: Sales Forecast & Actuals
-- ===============================================
-- Volume × price by product category, region, channel
-- Forecast = prior period baseline (simple moving average for trend)

with sales as (
    select * from {{ ref('stg_sales') }}
    where payment_status != 'Storno'  -- Exclude cancellations
),

products as (
    select * from {{ ref('stg_products') }}
),

branches as (
    select * from {{ ref('stg_branches') }}
),

regions as (
    select * from {{ ref('stg_regions') }}
),

-- Actual sales aggregated
actuals as (
    select
        p.category              as product_category,
        r.region_name,
        r.country,
        s.channel,
        extract(year from s.invoice_date)::integer   as fiscal_year,
        extract(month from s.invoice_date)::integer  as fiscal_month,
        to_char(s.invoice_date, 'YYYY-MM')           as fiscal_period,

        count(distinct s.invoice_id)    as num_invoices,
        sum(s.quantity)                 as total_units_sold,
        sum(s.total_excl_vat)           as revenue_actual,
        sum(s.total_cost)               as cogs_actual,
        sum(s.total_excl_vat) - sum(s.total_cost) as gross_profit_actual,

        -- Average metrics
        case when sum(s.quantity) > 0
            then round(sum(s.total_excl_vat) / sum(s.quantity), 2)
            else 0
        end as avg_selling_price,
        case when sum(s.quantity) > 0
            then round(sum(s.total_cost) / sum(s.quantity), 2)
            else 0
        end as avg_cost_per_unit,
        avg(s.discount_pct) as avg_discount_pct

    from sales s
    left join products p on s.product_id = p.product_id
    left join branches b on s.branch_id = b.branch_id
    left join regions r on b.region_id = r.region_id
    group by
        p.category, r.region_name, r.country, s.channel,
        extract(year from s.invoice_date),
        extract(month from s.invoice_date),
        to_char(s.invoice_date, 'YYYY-MM')
),

-- Forecast: use 3-month moving average as baseline
with_forecast as (
    select
        a.*,
        -- 3-month rolling average as forecast baseline
        round(avg(a.revenue_actual) over (
            partition by a.product_category, a.region_name, a.channel
            order by a.fiscal_year, a.fiscal_month
            rows between 3 preceding and 1 preceding
        ), 2) as forecast_revenue,
        round(avg(a.total_units_sold) over (
            partition by a.product_category, a.region_name, a.channel
            order by a.fiscal_year, a.fiscal_month
            rows between 3 preceding and 1 preceding
        ), 0) as forecast_units,
        -- Previous year same period (for YoY comparison)
        lag(a.revenue_actual, 12) over (
            partition by a.product_category, a.region_name, a.channel
            order by a.fiscal_year, a.fiscal_month
        ) as prev_year_revenue,
        lag(a.total_units_sold, 12) over (
            partition by a.product_category, a.region_name, a.channel
            order by a.fiscal_year, a.fiscal_month
        ) as prev_year_units
    from actuals a
)

select
    f.*,
    -- Forecast vs Actual variance
    f.revenue_actual - coalesce(f.forecast_revenue, 0) as revenue_variance_vs_forecast,
    case when coalesce(f.forecast_revenue, 0) > 0
        then round((f.revenue_actual - f.forecast_revenue) / f.forecast_revenue * 100, 2)
        else null
    end as revenue_variance_pct,

    -- Gross margin
    case when f.revenue_actual > 0
        then round(f.gross_profit_actual / f.revenue_actual * 100, 2)
        else 0
    end as gross_margin_pct,

    -- YoY growth
    case when coalesce(f.prev_year_revenue, 0) > 0
        then round((f.revenue_actual - f.prev_year_revenue) / f.prev_year_revenue * 100, 2)
        else null
    end as yoy_revenue_growth_pct,
    case when coalesce(f.prev_year_units, 0) > 0
        then round((f.total_units_sold - f.prev_year_units)::numeric / f.prev_year_units * 100, 2)
        else null
    end as yoy_volume_growth_pct

from with_forecast f
