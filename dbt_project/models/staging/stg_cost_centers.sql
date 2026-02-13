-- stg_cost_centers: Clean cost center dimension
-- Source: raw.dim_strediska

with source as (
    select * from {{ source('raw', 'dim_strediska') }}
)

select
    stredisko_id            as cost_center_id,
    stredisko_nazev         as cost_center_name,
    typ                     as type,
    nadrazene_stredisko     as parent_cost_center_id,
    pobocka_id              as branch_id,
    stav                    as status,
    current_timestamp       as _loaded_at
from source
