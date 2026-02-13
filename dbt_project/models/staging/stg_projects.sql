-- stg_projects: Clean project dimension
-- Source: raw.dim_projekty

with source as (
    select * from {{ source('raw', 'dim_projekty') }}
)

select
    projekt_id              as project_id,
    projekt_nazev           as project_name,
    stav                    as status,
    rozpocet::numeric       as budget,
    datum_zahajeni::date    as start_date,
    datum_ukonceni::date    as end_date,
    typ                     as type,
    current_timestamp       as _loaded_at
from source
