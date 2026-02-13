-- stg_customers: Clean customer dimension
-- Source: raw.dim_zakaznici

with source as (
    select * from {{ source('raw', 'dim_zakaznici') }}
)

select
    zakaznik_id                 as customer_id,
    zakaznik_nazev              as customer_name,
    segment,
    region_id,
    adresa                      as address,
    mesto                       as city,
    stav                        as status,
    kreditni_limit::numeric     as credit_limit,
    platebni_podminky           as payment_terms,
    current_timestamp           as _loaded_at
from source
