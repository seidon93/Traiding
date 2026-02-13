-- stg_regions: Clean region dimension
-- Source: raw.dim_regiony

with source as (
    select * from {{ source('raw', 'dim_regiony') }}
)

select
    region_id,
    region_nazev    as region_name,
    zeme            as country,
    current_timestamp as _loaded_at
from source
