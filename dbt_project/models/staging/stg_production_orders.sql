-- stg_production_orders: Clean manufacturing / production data
-- Source: raw.fact_vyrobni_zakazky

with source as (
    select * from {{ source('raw', 'fact_vyrobni_zakazky') }}
)

select
    zakazka_id                      as production_order_id,
    produkt_id                      as product_id,
    planovane_mnozstvi::integer     as planned_quantity,
    datum_zahajeni::date            as start_date,
    datum_ukonceni::date            as end_date,
    stredisko_id                    as cost_center_id,
    naklady_material::numeric       as material_cost,
    naklady_prace::numeric          as labor_cost,
    naklady_rezie::numeric          as overhead_cost,
    celkove_naklady::numeric        as total_cost,
    stav                            as status,
    vyuziti_kapacity::numeric       as capacity_utilization,
    zmetky::integer                 as defects,
    current_timestamp               as _loaded_at
from source
