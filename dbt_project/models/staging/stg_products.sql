-- stg_products: Clean product dimension
-- Source: raw.dim_produkty

with source as (
    select * from {{ source('raw', 'dim_produkty') }}
)

select
    produkt_id                  as product_id,
    produkt_nazev               as product_name,
    kategorie                   as category,
    prodejni_cena::numeric      as selling_price,
    nakladova_cena::numeric     as cost_price,
    jednotka                    as unit,
    stav                        as status,
    current_timestamp           as _loaded_at
from source
