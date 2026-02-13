-- stg_profit_centers: Clean profit center dimension
-- Source: raw.dim_profit_centra

with source as (
    select * from {{ source('raw', 'dim_profit_centra') }}
)

select
    profit_centrum_id   as profit_center_id,
    nazev               as name,
    region_id,
    manazer             as manager,
    stav                as status,
    rocni_cil::numeric  as annual_target,
    current_timestamp   as _loaded_at
from source
