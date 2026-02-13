-- stg_purchases: Clean purchase / procurement data
-- Source: raw.fact_nakupy

with source as (
    select * from {{ source('raw', 'fact_nakupy') }}
)

select
    objednavka_id                   as order_id,
    datum::date                     as order_date,
    dodavatel_id                    as supplier_id,
    typ_polozky                     as item_type,
    mnozstvi::integer               as quantity,
    jednotkova_cena::numeric        as unit_price,
    celkem_bez_dph::numeric         as total_excl_vat,
    dph_sazba::numeric              as vat_rate,
    dph_castka::numeric             as vat_amount,
    celkem_s_dph::numeric           as total_incl_vat,
    stredisko_id                    as cost_center_id,
    stav                            as status,
    mena                            as currency,
    current_timestamp               as _loaded_at
from source
