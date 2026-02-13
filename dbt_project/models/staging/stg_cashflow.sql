-- stg_cashflow: Clean cash flow data
-- Source: raw.fact_cashflow

with source as (
    select * from {{ source('raw', 'fact_cashflow') }}
)

select
    cashflow_id,
    datum::date         as transaction_date,
    typ_pohybu          as movement_type,
    smer                as direction,
    castka::numeric     as amount,
    ucet                as account_number,
    pobocka_id          as branch_id,
    mena                as currency,
    stav                as status,
    current_timestamp   as _loaded_at
from source
