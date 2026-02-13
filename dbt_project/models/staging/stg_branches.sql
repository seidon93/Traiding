-- stg_branches: Clean branch/office dimension
-- Source: raw.dim_pobocky

with source as (
    select * from {{ source('raw', 'dim_pobocky') }}
)

select
    pobocka_id      as branch_id,
    pobocka_nazev   as branch_name,
    adresa          as address,
    mesto           as city,
    region_id,
    stav            as status,
    current_timestamp as _loaded_at
from source
