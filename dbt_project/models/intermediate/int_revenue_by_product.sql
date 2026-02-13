-- int_revenue_by_product: Aggregate sales revenue by product, segment, channel
-- Supports revenue analysis and profitability reporting

with sales as (
    select * from {{ ref('stg_sales') }}
),

products as (
    select * from {{ ref('stg_products') }}
),

customers as (
    select * from {{ ref('stg_customers') }}
)

select
    s.product_id,
    p.product_name,
    p.category              as product_category,
    c.segment               as customer_segment,
    s.channel,
    s.currency,
    extract(year from s.invoice_date)   as fiscal_year,
    extract(month from s.invoice_date)  as fiscal_month,
    to_char(s.invoice_date, 'YYYY-MM')  as fiscal_period,
    -- Aggregated metrics
    count(*)                            as num_invoices,
    sum(s.quantity)                      as total_quantity,
    sum(s.total_excl_vat)               as revenue_excl_vat,
    sum(s.vat_amount)                   as total_vat,
    sum(s.total_incl_vat)               as revenue_incl_vat,
    sum(s.total_cost)                   as total_cost_of_goods,
    sum(s.total_excl_vat) - sum(s.total_cost) as gross_margin,
    case
        when sum(s.total_excl_vat) > 0
        then round((sum(s.total_excl_vat) - sum(s.total_cost)) / sum(s.total_excl_vat) * 100, 2)
        else 0
    end as gross_margin_pct,
    avg(s.discount_pct)                 as avg_discount_pct
from sales s
left join products p on s.product_id = p.product_id
left join customers c on s.customer_id = c.customer_id
where s.payment_status != 'Storno'  -- Exclude cancelled invoices
group by
    s.product_id, p.product_name, p.category,
    c.segment, s.channel, s.currency,
    extract(year from s.invoice_date),
    extract(month from s.invoice_date),
    to_char(s.invoice_date, 'YYYY-MM')
