-- stg_suppliers: Clean supplier dimension
-- Source: raw.dim_dodavatele

with source as (
    select * from {{ source('raw', 'dim_dodavatele') }}
)

select
    dodavatel_id            as supplier_id,
    dodavatel_nazev         as supplier_name,
    kategorie               as category,
    hodnoceni               as rating,
    adresa                  as address,
    mesto                   as city,
    zeme                    as country,
    stav                    as status,
    platebni_podminky       as payment_terms,
    current_timestamp       as _loaded_at
from source
