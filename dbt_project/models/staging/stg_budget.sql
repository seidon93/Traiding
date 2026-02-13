-- stg_budget: Clean budget vs actual data
-- Source: raw.fact_budget

with source as (
    select * from {{ source('raw', 'fact_budget') }}
)

select
    stredisko_id                as cost_center_id,
    ucet_cislo                  as account_number,
    obdobi                      as period,
    plan::numeric               as planned_amount,
    skutecnost::numeric         as actual_amount,
    odchylka::numeric           as variance,
    odchylka_pct::numeric       as variance_pct,
    current_timestamp           as _loaded_at
from source
