-- stg_sales: Clean sales / revenue data
-- Source: raw.fact_prodeje

with source as (
    select * from {{ source('raw', 'fact_prodeje') }}
)

select
    faktura_id                      as invoice_id,
    datum::date                     as invoice_date,
    zakaznik_id                     as customer_id,
    produkt_id                      as product_id,
    mnozstvi::integer               as quantity,
    jednotkova_cena::numeric        as unit_price,
    sleva_pct::numeric              as discount_pct,
    celkem_bez_dph::numeric         as total_excl_vat,
    dph_sazba::numeric              as vat_rate,
    dph_castka::numeric             as vat_amount,
    celkem_s_dph::numeric           as total_incl_vat,
    nakladova_cena_celkem::numeric  as total_cost,
    pobocka_id                      as branch_id,
    kanal                           as channel,
    stav_platby                     as payment_status,
    mena                            as currency,
    current_timestamp               as _loaded_at
from source
